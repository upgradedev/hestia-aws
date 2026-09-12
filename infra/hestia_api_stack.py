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
                "Effect": "Deny",
                "Action": ["bedrock:*", "ses:*", "s3:DeleteObject", "s3:DeleteObjectVersion"],
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
        "MemorySize": 512,
        "ReservedConcurrentExecutions": 2,
        "Environment": {"Variables": {
            "HESTIA_STATE_BUCKET": ref("State"),
            "HESTIA_STATE_PREFIX": "audit/",
            "HESTIA_COMMIT_SHA": ref("CommitSha"),
            "HESTIA_SES_REGION": "eu-west-1",
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

    return {
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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    print(json.dumps(template(), indent=2))
