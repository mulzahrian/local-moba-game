export async function load(url, ctx, next) {
  if (/\.(glb|mp3|png|jpg|css)(\?|$)/.test(url) || ctx.format === undefined && /\.glb/.test(url)) return { format: 'module', source: 'export default "x"', shortCircuit: true };
  return next(url, ctx);
}
