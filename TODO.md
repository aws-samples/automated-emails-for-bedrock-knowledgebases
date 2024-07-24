Generic README stuff

- [ ] Instructions on manually setting up email domain
    - Domain name and verified identity within SES. Domain name registered within the same account as where this
      solution
      will be deployed, then this CDK
      package will do the necessary configuration for your within Route 53 and SES. Otherwise, see instructions to
      register
      and ver ify your domain within SES
      (w/ link or instructions
      added: https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html#verify-domain-procedure)

    1. Create and verify your domain ownership with Amazon SES
       a/ create domain identity in SES
       b/ add DKIM records to DNS, Route53 or otherwise
       c/ add DMARC record to DNS, Route53 or otherwise
       d/ takes a short bit to verify your DNS identity - receive email that DKIM is setup
       e/ add MX record for SES to be able to receive email for your domain
       ex.10 inbound-smtp.{region}.amazonaws.com
       NOTE: need to request production access to be able to send emails to unverified senders

- [ ] make sure we let them know that the emailReviewDest email address if it's not in the same domain, then the SES
  account
  must be production not sandbox