// A good enricher living alongside a broken one — must still load.
export default async function tagger(ctx: any): Promise<void> {
  ctx.page.__tagged = true;
}
