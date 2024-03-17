import { type ServerChoice, config } from '../config';

export default abstract class MCStatus {
	private static readonly BASE_URL = 'https://api.mcstatus.io/v2/status/java';

	/**
	 * Queries a server status. Can throw an Error if the statusCode is not 200(ok).
	 */
	public static async queryFull(serverChoice: ServerChoice) {
		const { host, port } = config.mcConfig[serverChoice];
		const queryAdress = `${MCStatus.BASE_URL}/${host}:${port}`;
		const fetched = await fetch(queryAdress);

		if (!fetched.ok) {
			throw new Error(
				`Server status query for ${serverChoice} failed with code: ${fetched.status} (${fetched.statusText})`,
			);
		}

		return (await fetched.json()) as MCStatusResponse;
	}
}

type MCStatusResponse = {
	online: boolean;
	host: string;
	port: number;
	ip_adress: string | null;
	eula_blocked: boolean;
	retrieved_at: number;
	expires_at: number;
	version?: MCStatusVersionResponse | null;
	players?: MCStatusPlayersResponse | null;
	motd?: {
		raw: string;
		clean: string;
		html: string;
	};
	icon?: string | null;
	mods?: {
		name: string;
		version: string;
	}[];
	plugins?: {
		name: string;
		version: string;
	}[];
	software?: string;
	srv_record?: {
		host: string;
		port: string;
	};
};

type MCStatusVersionResponse = {
	name_raw: string;
	name_clean: string;
	name_html: string;
	protocol: number;
};

type MCStatusPlayersResponse = {
	online: number;
	max: number;
	list: {
		uuid: string;
		name_raw: string;
		name_clean: string;
		name_html: string;
	}[];
};
