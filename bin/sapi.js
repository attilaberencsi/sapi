#!/usr/bin/env node

process.title = "sapi";

function parsePortFromArgs(args) {
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === "--port" || arg === "-p") {
			return args[index + 1];
		}

		if (arg.startsWith("--port=")) {
			return arg.slice("--port=".length);
		}
	}

	return undefined;
}

const rawPort = parsePortFromArgs(process.argv.slice(2));
if (rawPort !== undefined) {
	const parsedPort = Number(rawPort);
	const isValidPort = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535;

	if (!isValidPort) {
		console.error(`Invalid port: ${rawPort}. Use an integer between 1 and 65535.`);
		process.exit(1);
	}

	process.env.PORT = String(parsedPort);
}

require("../server.js");
