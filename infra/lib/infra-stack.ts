import { Stack, StackProps, CfnOutput, Duration, Token } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import ecs = require('aws-cdk-lib/aws-ecs');
import ecs_patterns = require('aws-cdk-lib/aws-ecs-patterns');
import ec2 = require('aws-cdk-lib/aws-ec2');
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import rds = require('aws-cdk-lib/aws-rds');
import path = require("path");
import { CdkResourceInitializer } from './resource-initializer';
import { DockerImageCode } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

export class InfraStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create Docker Image Asset
    const asset = new DockerImageAsset(this, 'MyBuildImage', {
      directory: path.join(__dirname, '../..', 'TechChallengeApp'),
    });

    // Create VPC and Fargate Cluster
    const vpc = new ec2.Vpc(this, 'MyVpc');
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

    // Create RDS database
    const rdsDatabase = new rds.DatabaseInstance(this, 'RdsDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_10_17 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
      vpc
    });

    // Instantiate Fargate Service with just cluster and image
    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, "FargateService", {
      cluster,
      taskImageOptions: {
        image: ecs.ContainerImage.fromDockerImageAsset(asset),
        containerPort: 3000,
        environment: {
          VTT_DBPASSWORD: Token.asString(rdsDatabase.secret?.secretValueFromJson('password')), // Pass RDS password from secret manager as an environment variable to Fargate without hardcoding the credentials
          VTT_DBHOST: Token.asString(rdsDatabase.secret?.secretValueFromJson('host')), // Pass RDS host address from secret manager as an environment variable to Fargate without hardcoding the host address
        },
      },
    });

    // Add security group rule to allow access from Fargate Service to RDS on port 5432
    rdsDatabase.connections.allowFrom(fargateService.service, ec2.Port.tcp(5432));

    // Add 
    const rdsDataSeedingInitializer = new CdkResourceInitializer(this, 'myRdsDataSeedingInitializer', {
      config: {
        credsSecretName: rdsDatabase.secret?.secretName
      },
      fnLogRetention: RetentionDays.FIVE_MONTHS,
      fnCode: DockerImageCode.fromImageAsset(path.join(__dirname, '../', 'lambda/rds-init-fn-code'), {}),
      fnTimeout: Duration.minutes(2),
      fnSecurityGroups: [],
      vpc,
      subnetsSelection: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_WITH_NAT
      })
    })

    // allow the initializer function to connect to the RDS instance
    rdsDatabase.connections.allowFrom(rdsDataSeedingInitializer.function, ec2.Port.tcp(5432))

    // allow initializer function to read RDS instance creds secret
    rdsDatabase.secret?.grantRead(rdsDataSeedingInitializer.function)

    // Output RDS data seeding function response
    new CfnOutput(this, 'RdsInitFnResponse', {
      value: Token.asString(rdsDataSeedingInitializer.response)
    })

  }
}
