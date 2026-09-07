namespace TheBarcode.Api;

public sealed record PlanDefinition(
    string Code,
    string Name,
    string Price,
    string Summary,
    IReadOnlySet<string> Modules,
    int BranchLimit,
    int TerminalLimit,
    int UserLimit);

public static class PlanCatalog
{
    public const string OpenPreview = "OpenPreview";

    private static readonly IReadOnlySet<string> AllModules = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        { "sales", "inventory", "expenses", "reports", "ai", "production", "accounting" };

    private static readonly IReadOnlyDictionary<string, PlanDefinition> Plans =
        new Dictionary<string, PlanDefinition>(StringComparer.OrdinalIgnoreCase)
        {
            [OpenPreview] = new(OpenPreview, "Open Preview", "Local testing", "All completed modules remain available while the product is evaluated.", AllModules, 99, 99, 99),
            ["Lite"] = new("Lite", "TheBarcode Lite", "KES 499 / month", "Local-first POS for one business and one device.", new HashSet<string>(new[] { "sales", "inventory", "expenses", "reports" }, StringComparer.OrdinalIgnoreCase), 1, 1, 5),
            ["Connect"] = new("Connect", "TheBarcode Connect", "KES 2,490 / month", "Shared operational data for one outlet and multiple terminals.", new HashSet<string>(new[] { "sales", "inventory", "expenses", "reports", "ai", "accounting" }, StringComparer.OrdinalIgnoreCase), 1, 10, 25),
            ["Growth"] = new("Growth", "TheBarcode Growth", "KES 5,490 / month", "Production, costing, accounting and insights for a growing business.", AllModules, 3, 50, 100),
            ["Enterprise"] = new("Enterprise", "TheBarcode Enterprise", "From KES 12,500 / month", "Multi-branch and multi-tenant operations with negotiated limits.", AllModules, 999, 999, 999),
        };

    public static IReadOnlyCollection<PlanDefinition> All => Plans.Values.ToArray();

    public static PlanDefinition Get(string? code) => code is not null && Plans.TryGetValue(code, out var plan) ? plan : Plans[OpenPreview];

    public static bool IsKnown(string? code) => code is not null && Plans.ContainsKey(code);

    public static bool AllowsModule(string? code, string module) => Get(code).Modules.Contains(module);

    public static IReadOnlySet<string> NormalizeModules(string? planCode, IEnumerable<string>? requested)
    {
        var plan = Get(planCode);
        var requestedSet = (requested ?? plan.Modules).Select(x => x.Trim().ToLowerInvariant()).ToHashSet(StringComparer.OrdinalIgnoreCase);
        requestedSet.IntersectWith(plan.Modules);
        foreach (var required in new[] { "sales", "inventory", "expenses" }) requestedSet.Add(required);
        return requestedSet;
    }
}
