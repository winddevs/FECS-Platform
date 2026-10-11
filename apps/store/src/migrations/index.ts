import * as migration_20250923_000738 from "./20250923_000738";
import * as migration_20250924_131937 from "./20250924_131937";
import * as migration_20260624_195826 from "./20260624_195826";
import * as migration_20261011_034331_add_vietnamese_locale from "./20261011_034331_add_vietnamese_locale";

export const migrations = [
  {
    up: migration_20250923_000738.up,
    down: migration_20250923_000738.down,
    name: "20250923_000738",
  },
  {
    up: migration_20250924_131937.up,
    down: migration_20250924_131937.down,
    name: "20250924_131937",
  },
  {
    up: migration_20260624_195826.up,
    down: migration_20260624_195826.down,
    name: "20260624_195826",
  },
  {
    up: migration_20261011_034331_add_vietnamese_locale.up,
    down: migration_20261011_034331_add_vietnamese_locale.down,
    name: "20261011_034331_add_vietnamese_locale",
  },
];
