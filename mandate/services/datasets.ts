export const marketFixture={ETH:[100,110,120],BTC:[200,220,240]} as const;
export function expectedStats(asset:"ETH"|"BTC"){const values=marketFixture[asset];return {datasetId:"mandate-fixed-fixture-v2",asset,count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length};}
