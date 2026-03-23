self.onmessage = async () => {
	const { Container } = await import("pixi.js");
	console.log("PixiJS Container available:", !!Container);
};
export {};
