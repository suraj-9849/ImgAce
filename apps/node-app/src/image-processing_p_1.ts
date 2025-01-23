import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as s3Deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';

export class ImageOptimizerStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // S3 Bucket for original images
        const originalImageBucket = new s3.Bucket(this, 'OriginalImageBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true, // automatically delete objects when bucket is removed
            publicReadAccess: false,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Public Access is Blocked!!
        });

        // Lambda function to process images
        const imageOptimizerLambda = new lambda.Function(this, 'ImageOptimizerLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('src/image-processing_p_2'),
            memorySize: 1024,
            timeout: cdk.Duration.seconds(15),
            environment: {
                BUCKET_NAME: originalImageBucket.bucketName,
            },
        });

        // Grant Lambda permission to read from the S3 bucket
        originalImageBucket.grantRead(imageOptimizerLambda);

        // CloudFront distribution : Super Cool
        const cloudFrontDistribution = new cloudfront.Distribution(this, 'ImageOptimizerDistribution', {
            defaultBehavior: {
                origin: new origins.HttpOrigin(`${imageOptimizerLambda.functionName}.lambda-url`),
                cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, // Disable caching for simplicity
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
        });

        // deploying sample images to the S3 bucket
        new s3Deploy.BucketDeployment(this, 'DeploySampleImages', {
            destinationBucket: originalImageBucket,
            sources: [s3Deploy.Source.asset('./images')],
        });

        // Output the CloudFront URL
        new cdk.CfnOutput(this, 'CloudFrontURL', {
            value: cloudFrontDistribution.distributionDomainName,
        });

        // Output the S3 bucket name
        new cdk.CfnOutput(this, 'S3BucketName', {
            value: originalImageBucket.bucketName,
        });
    }
}
