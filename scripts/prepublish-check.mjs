// prepublishOnly guard: publishing goes through the host script `snvrweb-publish.sh <version>`, which builds
// the git tag v<version> in a clean checkout and sets SNVR_PUBLISH_TAG. A plain `npm publish` from a
// working copy stops here.
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tag = process.env.SNVR_PUBLISH_TAG;
if (tag !== `v${version}`) {
  console.error(
    `prepublish: refusing to publish ${version} (SNVR_PUBLISH_TAG=${tag ?? 'unset'}); use snvrweb-publish.sh ${version}`,
  );
  process.exit(1);
}
console.log(`prepublish: ${tag} ok`);
