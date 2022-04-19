#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/infra-stack';

const app = new cdk.App();

const hashCode = (string: string) => {
	var hash = 0;
	if (string.length === 0) return hash;
	for (let i = 0; i < string.length; i++) {
		let char = string.charCodeAt(i);
		hash = ((hash<<5)-hash)+char;
		hash = hash & hash;
	}
	return hash;
}

new InfraStack(app, 'InfraStack', {
  stackName: `InfraStack${hashCode('InfraStack')}`
});