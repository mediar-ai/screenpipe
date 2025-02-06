import { API_BASE_URL } from "../../constants";
import { Credentials } from "../../utils/credentials";
import { colors, symbols } from "../../utils/colors";
import { Command } from "commander";
import { handleError } from "../components/commands/add/utils/handle-error";

export const listVersionsCommand = new Command()
  .name('list-versions')
  .description('List all versions of a pipe')
  .requiredOption('--name <name>', 'name of the pipe')
  .action(async (opts) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/plugins/list-versions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Credentials.getApiKey()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: opts.name,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`failed to list versions ${error.error}`);
      }

      const data = await response.json();
      console.log(colors.header(`plugin Information`));
      console.log(colors.listItem(`${colors.label("Name")} ${opts.name}`));
      console.log(colors.listItem(`${colors.label("ID")} ${data.plugin_id}`));

      console.log(colors.header("version History"));
      data.versions.forEach((version: any) => {
        const status =
          version.status === "published"
            ? colors.success(version.status)
            : colors.warning(version.status);

        console.log(
          colors.primary(
            `\n  ${symbols.arrow} version ${colors.bold(
              version.version
            )} ${colors.dim(`(${status})`)}`
          )
        );
        console.log(
          colors.listItem(
            `${colors.label("created")} ${new Date(
              version.created_at
            ).toLocaleString()}`
          )
        );
        console.log(
          colors.listItem(
            `${colors.label("size")} ${(version.file_size / 1024).toFixed(
              2
            )} KB`
          )
        );
        console.log(
          colors.listItem(
            `${colors.label("hash")} ${colors.dim(version.file_hash)}`
          )
        );
        if (version.changelog) {
          console.log(
            colors.listItem(`${colors.label("changelog")} ${version.changelog}`)
          );
        }
      });
    } catch (error) {
      if (error instanceof Error) {
        handleError(
          `\n${symbols.error} list versions failed: ${error.message}`
        )
      } else {
        handleError(
          `\n${symbols.error} list versions failed with unexpected error`
        );
      }
    }
  });