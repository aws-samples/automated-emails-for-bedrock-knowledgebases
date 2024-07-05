import { Construct } from "constructs";
import { HostedZone, IHostedZone, MxRecord } from "aws-cdk-lib/aws-route53";
import { Stack } from "aws-cdk-lib";

export interface IRoute53EmailConfigurationConstructProps {
  hostedZoneName: string;
}

export class Route53EmailConfigurationConstruct extends Construct {
  public hostedZone: IHostedZone;
  constructor(
    scope: Construct,
    id: string,
    props: IRoute53EmailConfigurationConstructProps,
  ) {
    super(scope, id);

    // Look up HostedZone by name
    this.hostedZone = HostedZone.fromLookup(this, "PublicHostedZone", {
      domainName: props.hostedZoneName,
    });

    // Create MX record to allow for SES to handle incoming email
    new MxRecord(this, "Route53MXRecord", {
      values: [
        {
          hostName: `inbound-smtp.${Stack.of(this).region}.amazonaws.com`,
          priority: 123,
        },
      ],
      zone: this.hostedZone,
    });
  }
}
