using TheBarcode.PrintBridge;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://127.0.0.1:17777");
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
  .WithOrigins("http://localhost:8088", "http://127.0.0.1:8088", "http://localhost:8090", "http://127.0.0.1:8090")
  .AllowAnyHeader()
  .AllowAnyMethod()));

var app = builder.Build();
app.UseCors();
app.MapGet("/health", () => Results.Ok(new { ready = true, service = "Dukora Print Bridge" }));
app.MapGet("/printers", () => Results.Ok(RawPrinter.GetInstalledPrinters()));
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
