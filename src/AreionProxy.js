export const Proxy = (src: string): Promise<string> =>
	Promise.resolve(Areion.rewriteUrl(src));
