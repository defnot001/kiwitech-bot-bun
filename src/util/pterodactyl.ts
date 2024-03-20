import { PteroClient } from 'ptero-client';
import { type ServerChoice, config } from '../config';

export const ptero = new PteroClient({
	baseURL: config.ptero.url,
	apiKey: config.ptero.apiKey,
});

export async function getModFiles(serverChoice: ServerChoice) {
	const modFiles = await (
		await ptero.files.list(config.mcConfig[serverChoice].serverId, '/mods')
	).filter((mod) => {
		return mod.is_file;
	});

	return modFiles;
}

async function getMods(serverChoice: ServerChoice) {
	const modFiles = await getModFiles(serverChoice);

	return {
		enabled: modFiles.filter((mod) => {
			return mod.name.endsWith('.jar');
		}),
		disabled: modFiles.filter((mod) => {
			return mod.name.endsWith('.disabled');
		}),
	};
}

export async function getModNames(serverChoice: ServerChoice) {
	const mods = await getMods(serverChoice);

	return {
		enabled: mods.enabled.map((mod) => mod.name.replace('.jar', '')),
		disabled: mods.disabled.map((mod) => mod.name.replace('.disabled', '')),
	};
}
