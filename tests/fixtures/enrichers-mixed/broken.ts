// Throws while being imported — loadEnrichers must catch this and carry on
// loading the other enrichers rather than aborting the whole crawl.
throw new Error("boom at import time");

export default async function never(): Promise<void> {}
