const handler = require("../admin-orders");

module.exports = function route(req, res) {
	if (req.method !== "PATCH") {
		res.statusCode = 405;
		res.setHeader("Content-Type", "application/json");
		res.end(JSON.stringify({ error: "Method not allowed" }));
		return;
	}
	return handler(req, res);
};
