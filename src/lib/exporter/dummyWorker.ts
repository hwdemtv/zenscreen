self.onmessage = (e) => {
	console.log("Dummy worker received message:", e.data);
	self.postMessage({ type: "progress", progress: { percentage: 100 } });
	self.postMessage({ type: "done" });
};
export {};
