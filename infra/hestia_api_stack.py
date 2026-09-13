"""CloudFormation for Hestia's isolated household sentinel API.

No external-send permissions, no billing APIs, zero-credential public front door.
"""
from __future__ import annotations

import argparse
import json

try:
    from infra.frontend_stack import attr, ref, sub
except ImportError:
    from frontend_stack import attr, ref, sub


BEDROCK_MODEL_ID = "eu.anthropic.claude-haiku-4-5-20251001-v1:0"
AGENT_LIMITS = {"session_cap": "3", "extract_session_cap": "3", "daily_cap": "200",
                "max_output_tokens": "700"}


def template():
    private = {
        "PublicAccessBlockConfiguration": {
            "BlockPublicAcls": True, "BlockPublicPolicy": True,
            "IgnorePublicAcls": True, "RestrictPublicBuckets": True,
        },
        "OwnershipControls": {"Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}]},
        "BucketEncryption": {"ServerSideEncryptionConfiguration": [
            {"ServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}
        ]},
        "VersioningConfiguration": {"Status": "Enabled"},
    }

    state_props = {
        **private,
        "BucketName": sub("hestia-afh-state-${AWS::AccountId}-${AWS::Region}"),
        "LifecycleConfiguration": {"Rules": [
            {
                "Id": "household-audit-retention",
                "Status": "Enabled",
                "Prefix": "audit/",
                "ExpirationInDays": 90,
            },
            {
                "Id": "old-audit-versions",
                "Status": "Enabled",
                "NoncurrentVersionExpirationInDays": 30,
            },
        ]},
        "Tags": [{"Key": "project", "Value": "hestia-agentsforhumans"}],
    }

    state_tls_doc = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Deny", "Principal": "*", "Action": "s3:*",
            "Resource": [attr("State", "Arn"), sub("${State.Arn}/*")],
            "Condition": {"Bool": {"aws:SecureTransport": "false"}},
        }],
    }

    role_policy_doc = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": ["s3:GetObject", "s3:PutObject"],
                "Resource": sub("${State.Arn}/demo/workspaces/*"),
            },
            {
                "Effect": "Allow",
                "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
                "Resource": sub(
                    "arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:"
                    "log-group:/aws/lambda/hestia-afh-api:*"
                ),
            },
            {
                # Owner-approved bounded model access (2026-09-13): one Haiku profile only.
                "Effect": "Allow",
                "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
                "Resource": [
                    sub("arn:${AWS::Partition}:bedrock:${AWS::Region}:${AWS::AccountId}:"
                        "inference-profile/" + BEDROCK_MODEL_ID),
                    "arn:aws:bedrock:*::foundation-model/" + BEDROCK_MODEL_ID.split(".", 1)[1],
                ],
            },
            {
                "Effect": "Deny",
                "Action": ["ses:*", "s3:DeleteObject", "s3:DeleteObjectVersion"],
                "Resource": "*",
            },
        ],
    }

    fn_props = {
        "FunctionName": "hestia-afh-api",
        "Runtime": "python3.11",
        "Architectures": ["x86_64"],
        "Handler": "hestia.app.web.lambda_handler",
        "Role": attr("Role", "Arn"),
        "Code": {"S3Bucket": ref("CodeBucket"), "S3Key": ref("CodeKey")},
        "Timeout": 28,
        "MemorySize": 1024,
        "ReservedConcurrentExecutions": 2,
        "Environment": {"Variables": {
            "HESTIA_STATE_BUCKET": ref("State"),
            "HESTIA_STATE_PREFIX": "audit/",
            "HESTIA_COMMIT_SHA": ref("CommitSha"),
            "HESTIA_SES_REGION": "eu-west-1",
            "HESTIA_LIVE_MODEL": "bedrock",
            "HESTIA_BEDROCK_MODEL_ID": BEDROCK_MODEL_ID,
            "HESTIA_BEDROCK_REGION": "eu-west-1",
            "HESTIA_AGENT_SESSION_CAP": AGENT_LIMITS["session_cap"],
            "HESTIA_AGENT_EXTRACT_SESSION_CAP": AGENT_LIMITS["extract_session_cap"],
            "HESTIA_AGENT_DAILY_CAP": AGENT_LIMITS["daily_cap"],
            "HESTIA_AGENT_MAX_TOKENS": AGENT_LIMITS["max_output_tokens"],
            "HESTIA_DEMO_SECRET": sub(
                "{{resolve:secretsmanager:${DemoSecretArn}:SecretString}}"
            ),
        }},
        "Tags": [{"Key": "project", "Value": "hestia-agentsforhumans"}],
    }

    api_props = {
        "Name": "hestia-afh-api",
        "ProtocolType": "HTTP",
        "Description": "Read-only preview and capability-scoped synthetic demo actions.",
    }

    integration_props = {
        "ApiId": ref("Api"),
        "IntegrationType": "AWS_PROXY",
        "IntegrationUri": attr("Function", "Arn"),
        "PayloadFormatVersion": "2.0",
        "TimeoutInMillis": 28000,
    }

    permission_props = {
        "FunctionName": attr("Function", "Arn"),
        "Action": "lambda:InvokeFunction",
        "Principal": "apigateway.amazonaws.com",
        "SourceArn": sub(
            "arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${Api}/*"
        ),
    }

    result = {
        "AWSTemplateFormatVersion": "2010-09-09",
        "Description": "Hestia Agents for Humans household sentinel API and operations cockpit.",
        "Parameters": {
            "CodeBucket": {
                "Type": "String",
                "AllowedPattern": "hestia-afh-deploy-[0-9]{12}-eu-west-1",
            },
            "CodeKey": {"Type": "String", "AllowedPattern": "releases/[0-9a-f]{40}/hestia-api.zip"},
            "CommitSha": {"Type": "String", "AllowedPattern": "[0-9a-f]{40}"},
            "DemoSecretArn": {
                "Type": "String",
                "Description": "Dedicated demo-signing secret ARN; value at least 32 bytes.",
                "AllowedPattern": (
                    "arn:aws:secretsmanager:eu-west-1:[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+"
                ),
            },
        },
        "Resources": {
            "State": {
                "Type": "AWS::S3::Bucket", "DeletionPolicy": "Retain",
                "UpdateReplacePolicy": "Retain", "Properties": state_props,
            },
            "StateTls": {
                "Type": "AWS::S3::BucketPolicy",
                "Properties": {"Bucket": ref("State"), "PolicyDocument": state_tls_doc},
            },
            "Logs": {
                "Type": "AWS::Logs::LogGroup",
                "Properties": {"LogGroupName": "/aws/lambda/hestia-afh-api", "RetentionInDays": 14},
            },
            "Role": {
                "Type": "AWS::IAM::Role",
                "Properties": {
                    "RoleName": "hestia-afh-api-runtime",
                    "AssumeRolePolicyDocument": {"Version": "2012-10-17", "Statement": [{
                        "Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"},
                        "Action": "sts:AssumeRole",
                    }]},
                    "Policies": [{
                        "PolicyName": "household-audit-storage-only",
                        "PolicyDocument": role_policy_doc,
                    }],
                },
            },
            "Function": {
                "Type": "AWS::Lambda::Function",
                "DependsOn": "Logs",
                "Properties": fn_props,
            },
            "Api": {"Type": "AWS::ApiGatewayV2::Api", "Properties": api_props},
            "Integration": {
                "Type": "AWS::ApiGatewayV2::Integration",
                "Properties": integration_props,
            },

            "Route": {
                "Type": "AWS::ApiGatewayV2::Route",
                "Properties": {
                    "ApiId": ref("Api"),
                    "RouteKey": "$default",
                    "Target": sub("integrations/${Integration}"),
                },
            },
            "Stage": {
                "Type": "AWS::ApiGatewayV2::Stage",
                "Properties": {
                    "ApiId": ref("Api"), "StageName": "$default", "AutoDeploy": True,
                    "DefaultRouteSettings": {"ThrottlingRateLimit": 2, "ThrottlingBurstLimit": 4},
                },
            },
            "Permission": {"Type": "AWS::Lambda::Permission", "Properties": permission_props},
        },
        "Outputs": {
            "ApiUrl": {"Value": sub("https://${Api}.execute-api.${AWS::Region}.amazonaws.com/")},
            "ApiDomain": {"Value": sub("${Api}.execute-api.${AWS::Region}.amazonaws.com")},
            "FunctionName": {"Value": ref("Function")},
            "StateBucket": {"Value": ref("State")},
            "DeployedSha": {"Value": ref("CommitSha")},
        },
    }
    # The public reader carries no write credential. Mutations have a separate
    # function/role and still enforce the capability + exact-approval boundary.
    resources = result["Resources"]
    reader_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {"Effect": "Allow", "Action": ["s3:GetObject"],
             "Resource": sub("${State.Arn}/demo/workspaces/*")},
            {"Effect": "Allow", "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
             "Resource": sub(
                 "arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:"
                 "log-group:/aws/lambda/hestia-afh-reader:*"
             )},
            {"Effect": "Deny", "Action": ["s3:PutObject", "s3:DeleteObject",
                                          "s3:DeleteObjectVersion", "ses:*", "bedrock:*"],
             "Resource": "*"},
        ],
    }
    resources["ReaderRole"] = {
        "Type": "AWS::IAM::Role",
        "Properties": {
            "RoleName": "hestia-afh-reader-runtime",
            "AssumeRolePolicyDocument": resources["Role"]["Properties"]["AssumeRolePolicyDocument"],
            "Policies": [{"PolicyName": "scoped-read-only", "PolicyDocument": reader_policy}],
        },
    }
    resources["ReaderLogs"] = {
        "Type": "AWS::Logs::LogGroup",
        "Properties": {"LogGroupName": "/aws/lambda/hestia-afh-reader", "RetentionInDays": 14},
    }
    resources["ReaderFunction"] = {
        "Type": "AWS::Lambda::Function", "DependsOn": "ReaderLogs",
        "Properties": {**fn_props, "FunctionName": "hestia-afh-reader", "MemorySize": 512,
                       "Handler": "hestia.app.web.read_lambda_handler",
                       "Role": attr("ReaderRole", "Arn")},
    }
    resources["ReaderIntegration"] = {
        "Type": "AWS::ApiGatewayV2::Integration",
        "Properties": {**integration_props, "IntegrationUri": attr("ReaderFunction", "Arn")},
    }
    resources["ReaderPermission"] = {
        "Type": "AWS::Lambda::Permission",
        "Properties": {**permission_props, "FunctionName": attr("ReaderFunction", "Arn")},
    }
    resources["Route"]["Properties"]["Target"] = sub("integrations/${ReaderIntegration}")
    # Explicit methods, including historical aliases, avoid a default writer route.
    write_paths = (
        "/api/demo/session", "/api/action/claim/prepare", "/api/action/claim", "/action/claim",
        "/api/action/cancel", "/action/cancel_trial", "/api/action/utility_dispute",
        "/action/utility_dispute", "/api/action/reset", "/action/reset", "/api/action/receipt",
        "/api/receipt/scan", "/receipt/scan", "/api/ingest/sync", "/ingest/sync",
        "/api/outbox/dispatch", "/outbox/dispatch", "/api/outbox/status", "/outbox/status",
        "/api/case/update", "/api/agent/review", "/api/agent/extract",
    )
    for number, path in enumerate(write_paths):
        resources[f"WriteRoute{number}"] = {
            "Type": "AWS::ApiGatewayV2::Route",
            "Properties": {"ApiId": ref("Api"), "RouteKey": f"POST {path}",
                           "Target": sub("integrations/${Integration}")},
        }
    result["Outputs"]["ReaderFunctionName"] = {"Value": ref("ReaderFunction")}
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    print(json.dumps(template(), indent=2))
