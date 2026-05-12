import { createRequire } from "module";

const require = createRequire(import.meta.url);
const requiredPackages = ["express", "cors", "firebase-admin"];

const missing = requiredPackages.filter((pkg) => {
  try {
    require.resolve(pkg);
    return false;
  } catch {
    return true;
  }
});

if (missing.length) {
  console.error("\n❌ Backend dependencies are missing:", missing.join(", "));
  console.error("Run: cd backend && npm install\n");
  process.exit(1);
}

console.log("✅ Backend dependency check passed.");
