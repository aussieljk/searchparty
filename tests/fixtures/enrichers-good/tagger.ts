// A minimal, well-behaved fixture enricher: mutates ctx.page in place.
export default async function tagger(ctx: any): Promise<void> {
  ctx.page.__tagged = true;
}
