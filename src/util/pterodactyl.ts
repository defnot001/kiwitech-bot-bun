import { PteroClient } from 'ptero-client';
import { type ServerChoice, config } from '../config';
import { LOGGER } from './logger';

export const ptero = new PteroClient({
	baseURL: config.ptero.url,
	apiKey: config.ptero.apiKey,
});

/**
 * Gets all files from the mods directory of the chosen server.
 * Returns null if failed to get mod files.
 * @sideeffect Logs error if failed to get mod files.
 */
export async function getModFiles(serverChoice: ServerChoice) {
	const modFiles = await ptero.files
		.list(config.mcConfig[serverChoice].serverId, '/mods')
		.catch(async (e) => {
			await LOGGER.error(e, `Failed to get mod files for ${serverChoice}`);
			return null;
		});

	if (!modFiles) {
		return null;
	}

	return modFiles.filter((mod) => {
		return mod.is_file;
	});
}

/**
 * Gets all files with either a `.jar` or a `.disabled` extension from the mods directory of the chosen server.
 * Returns null if failed to get mod files.
 * @sideeffect Logs error if failed to get mod files.
 */
async function getJarAndDisabledFiles(serverChoice: ServerChoice) {
	const modFiles = await getModFiles(serverChoice);

	if (!modFiles) {
		return null;
	}

	return {
		enabled: modFiles.filter((mod) => {
			return mod.name.endsWith('.jar');
		}),
		disabled: modFiles.filter((mod) => {
			return mod.name.endsWith('.disabled');
		}),
	};
}

/**
 * Gets all mod names from the mods directory of the chosen server without the file extension.
 * Returns null if failed to get mod files.
 * @sideeffect No sideeffects.
 */
export async function getModNames(serverChoice: ServerChoice) {
	const mods = await getJarAndDisabledFiles(serverChoice);

	if (!mods) {
		return null;
	}

	return {
		enabled: mods.enabled.map((mod) => mod.name.replace('.jar', '')),
		disabled: mods.disabled.map((mod) => mod.name.replace('.disabled', '')),
	};
}
