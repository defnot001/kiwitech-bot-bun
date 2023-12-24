import { ServerChoice, config } from '../config';
import { Rcon, RconOptions } from '../rcon/rcon';

export default abstract class RCONUtil {
  public static async runSingleCommand(
    server: ServerChoice,
    command: string,
  ): Promise<string> {
    const client = await Rcon.connect(
      this.getRconOptionsFromServerChoice(server),
    );

    const response = await client.send(command);

    await client.end();

    return response;
  }

  public static async runMultipleCommands(
    server: ServerChoice,
    commands: string[],
  ): Promise<string[]> {
    const client = new Rcon(this.getRconOptionsFromServerChoice(server));
    await client.connect();

    const promises = commands.map((c) => client.send(c));
    const resolved = await Promise.all(promises);

    return resolved;
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
