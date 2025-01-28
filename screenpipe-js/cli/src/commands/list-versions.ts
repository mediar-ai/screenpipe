import { command, string } from "@drizzle-team/brocli";
import { API_BASE_URL } from "../constants";
import { Credentials } from "../utils/credentials";
import { colors, symbols } from "../utils/colors";

export const listVersionsCommand = command({
  name: "list-versions",
  desc: "List all versions of a pipe",
  options: {
    name: string().required().desc("name of the pipe"),
  },
  handler: async (opts) => {
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
        throw new Error(`Failed to list versions ${error.error}`);
      }

      const data = await response.json();
      console.log(colors.header(`Plugin Information`));
      console.log(colors.listItem(`${colors.label("Name")} ${opts.name}`));
      console.log(colors.listItem(`${colors.label("ID")} ${data.plugin_id}`));

      console.log(colors.header("Version History"));
      data.versions.forEach((version: any) => {
        const status =
          version.status === "published"
            ? colors.success(version.status)
            : colors.warning(version.status);

        console.log(
          colors.primary(
            `\n  ${symbols.arrow} Version ${colors.bold(
              version.version
            )} ${colors.dim(`(${status})`)}`
          )
        );
        console.log(
          colors.listItem(
            `${colors.label("Created")} ${new Date(
              version.created_at
            ).toLocaleString()}`
          )
        );
        console.log(
          colors.listItem(
            `${colors.label("Size")} ${(version.file_size / 1024).toFixed(
              2
            )} KB`
          )
        );
        console.log(
          colors.listItem(
            `${colors.label("Hash")} ${colors.dim(version.file_hash)}`
          )
        );
        if (version.changelog) {
          console.log(
            colors.listItem(`${colors.label("Changelog")} ${version.changelog}`)
          );
        }
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error(
          colors.error(
            `\n${symbols.error} List versions failed: ${error.message}`
          )
        );
      } else {
        console.error(
          colors.error(
            `\n${symbols.error} List versions failed with unexpected error`
          )
        );
      }
      process.exit(1);
    }
  },
});
