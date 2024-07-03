# Pre-reqs
- A domain name for SES
- titan text embed model enabled in Bedrock

# Steps

1. Configure SES (FIGURE THIS OUT)
2. Deploy App
```sh
npx cdk deploy
```
3. Upload Documents to S3
4. Trigger a Sync? Actually we probably want an event bridge rule to trigger a sync whenever content is updated




# API Call to enable access to a model
```typescript
https://bedrock.us-east-1.amazonaws.com/foundation-model-entitlement
{"modelId":"amazon.titan-embed-text-v1"}
```