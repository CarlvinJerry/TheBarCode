using TheBarcode.PrintBridge;

var builder = WebApplication.CreateBuilder(args);
// Respect the port supplied by the desktop host (Lite uses 17778 to avoid an
// older server-edition bridge already occupying 17777). Keep 17777 as the
// default for the server/browser edition and direct launches.
var listenUrl = "http://127.0.0.1:17777";
for (var index = 0; index < args.Length; index++)
{
  if (args[index].Equals("--urls", StringComparison.OrdinalIgnoreCase) && index + 1 < args.Length)
  {
    listenUrl = args[index + 1];
    break;
  }
  if (args[index].StartsWith("--urls=", StringComparison.OrdinalIgnoreCase))
  {
    listenUrl = args[index]["--urls=".Length..];
    break;
  }
}
builder.WebHost.UseUrls(listenUrl);
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
  .WithOrigins("http://localhost:8088", "http://127.0.0.1:8088", "http://localhost:8090", "http://127.0.0.1:8090", "http://localhost:5173", "http://127.0.0.1:5173")
  .AllowAnyHeader()
  .AllowAnyMethod()));

var app = builder.Build();
app.UseCors();
app.MapGet("/health", () => Results.Ok(new { ready = true, service = "Dukora Print Bridge" }));
app.MapGet("/printers", () => {
  try { return Results.Ok(RawPrinter.GetInstalledPrinters()); }
  catch (Exception ex) { return Results.Problem(ex.Message, statusCode: 503, title: "Unable to enumerate Windows printers"); }
});
app.MapGet("/queue", (string printerName) => {
  if (string.IsNullOrWhiteSpace(printerName)) return Results.BadRequest(new { error = "Choose a printer" });
  try { return Results.Ok(new { printerName, jobs = RawPrinter.GetQueue(printerName) }); }
  catch (Exception ex) { return Results.Problem(ex.Message, statusCode: 503, title: "Unable to inspect the printer queue"); }
});
app.MapPost("/queue/clear", (QueueClearRequest request) => {
  if (string.IsNullOrWhiteSpace(request.PrinterName) || !request.Confirm || !string.Equals(request.Scope, "TheBarcode", StringComparison.Ordinal)) return Results.BadRequest(new { error = "TheBarcode queue confirmation is required" });
  try { return Results.Ok(new { printerName = request.PrinterName, removed = RawPrinter.ClearQueue(request.PrinterName) }); }
  catch (Exception ex) { return Results.Problem(ex.Message, statusCode: 503, title: "Unable to clear TheBarcode print jobs"); }
});
app.MapPost("/print", (PrintRequest request) => {
  if (string.IsNullOrWhiteSpace(request.PrinterName)) return Results.BadRequest(new { error = "Choose a printer" });
  if (string.IsNullOrWhiteSpace(request.Text)) return Results.BadRequest(new { error = "Receipt is empty" });
  try {
    var bytes = EscPosReceipt.Build(request.Text, Math.Clamp(request.CharactersPerLine, 32, 64), request.Cut);
    RawPrinter.Send(request.PrinterName, bytes, "TheBarcode receipt");
    return Results.Ok(new { printed = true, bytes = bytes.Length });
  } catch (Exception ex) {
    return Results.Problem(ex.Message, statusCode: 503, title: "Printer rejected the job");
  }
});
app.Run();

record PrintRequest(string PrinterName, string Text, int CharactersPerLine = 48, bool Cut = false);
record QueueClearRequest(string PrinterName, string Scope, bool Confirm);
