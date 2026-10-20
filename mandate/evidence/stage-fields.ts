export const stageFields={
  "pre-payment":["request","requestHash","requirements","offer","internalQuoteSignature","payment","tokenDomain","registrationDigest","paymentDigest","authority"],
  registration:["preCheckpointRoot","registrationHash","registrationBlock","registrationBlockHash","payment"],
  payment:["settlementHash","settlementBlockHash","payment","state"],
  service:["paymentState","serviceState","resultState","httpStatus","resultDigest","result","merchantReceipt","receiptEvidence","errorCode"],
  decision:["paymentState","serviceState","resultState","httpStatus","resultDigest","result","merchantReceipt","receiptEvidence","errorCode"],
} as const;
