import re

with open("apps/api/src/modules/ingestion/ingestion.service.ts", "r") as f:
    text = f.read()

# Fix INVOICE
text = re.sub(
    r"if \(\s*wasEdited \|\|\s*appItem\.selectedTenantId \|\|\s*appItem\.selectedUsdaId\s*\)\s*\{",
    r"if (wasEdited) {",
    text
)

# Fix RECIPE
text = re.sub(
    r"if \(wasEdited \|\| appIng\.selectedTenantId \|\| appIng\.selectedUsdaId\) \{",
    r"if (wasEdited) {",
    text
)

with open("apps/api/src/modules/ingestion/ingestion.service.ts", "w") as f:
    f.write(text)
