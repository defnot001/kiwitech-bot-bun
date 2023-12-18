import { ServerChoice, config } from '../config';
import { Rcon, RconOptions } from '../rcon/rcon';

export default abstract class RCONUtil {
  public static async runSingleCommand(server: ServerChoice, command: string) {
    const client = new Rcon(this.getRconOptionsFromServerChoice(server));

    client.on('connect', () => console.log('connect'));
    client.on('authenticated', () => console.log('authenticated'));
    client.on('end', () => console.log('end'));

    await client.connect();

    const response = await client.send(command);

    client.end();

    return response;
  }

  private static getRconOptionsFromServerChoice(
    server: ServerChoice,
  ): RconOptions {
    const { host, rconPort, rconPasswd } = config.mcConfig[server];

    return {
      host,
      port: rconPort,
      password: rconPasswd,
    };
  }
}
