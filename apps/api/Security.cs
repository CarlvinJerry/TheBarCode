using System.Collections.Concurrent; using System.Security.Cryptography; using Microsoft.IdentityModel.Tokens; using Microsoft.AspNetCore.Authorization; using System.IdentityModel.Tokens.Jwt; using System.Security.Claims; using System.Text;
namespace TheBarcode.Api;
public static class Security
{
 public static string HashPin(string pin){var salt=RandomNumberGenerator.GetBytes(16);var hash=Rfc2898DeriveBytes.Pbkdf2(pin,salt,120_000,HashAlgorithmName.SHA256,32);return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";}
 public static bool VerifyPin(string pin,string stored){var p=stored.Split('.');if(p.Length!=2)return false;var salt=Convert.FromBase64String(p[0]);var expected=Convert.FromBase64String(p[1]);var actual=Rfc2898DeriveBytes.Pbkdf2(pin,salt,120_000,HashAlgorithmName.SHA256,32);return CryptographicOperations.FixedTimeEquals(expected,actual);}
 public static string Token(StaffUser user,string key){var creds=new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),SecurityAlgorithms.HmacSha256);var granted=ParsePermissions(user.Permissions);var claims=new List<Claim>{new(ClaimTypes.NameIdentifier,user.Id.ToString()),new(ClaimTypes.Name,user.Name),new(ClaimTypes.Role,user.Role),new("dukora_demo",user.IsDemo?"true":"false")};foreach(var permission in granted)claims.Add(new Claim("permission",permission));if(granted.Contains("reports")&&!user.Role.Equals("Owner",StringComparison.OrdinalIgnoreCase))claims.Add(new Claim(ClaimTypes.Role,"Auditor"));if(granted.Contains("approvals")&&!user.Role.Equals("Owner",StringComparison.OrdinalIgnoreCase))claims.Add(new Claim(ClaimTypes.Role,"Manager"));return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(claims:claims,expires:DateTime.UtcNow.AddHours(12),signingCredentials:creds));}
 public static IReadOnlySet<string> ParsePermissions(string? value)=>value?.Split(',',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries).Select(x=>x.ToLowerInvariant()).Where(AllowedPermissions.Contains).ToHashSet()??new HashSet<string>();
 public static readonly HashSet<string> AllowedPermissions=["reports","approvals","accounting","audit","expenses","inventory","sales","staff","settings"];
 public static AuthorizationPolicyBuilder RequirePermission(this AuthorizationPolicyBuilder policy,string permission)=>policy.RequireAssertion(context=>HasPermission(context.User,permission));
 public static bool HasPermission(ClaimsPrincipal principal,string permission){if(HasRole(principal,"Owner"))return true;var key=permission.ToLowerInvariant();if(principal.Claims.Any(c=>c.Type=="permission"&&c.Value.Equals(key,StringComparison.OrdinalIgnoreCase)))return true;var role=principal.FindFirst(ClaimTypes.Role)?.Value;return role switch {"Manager"=>key is "reports" or "approvals" or "accounting" or "audit" or "expenses" or "inventory","Auditor"=>key is "reports" or "audit" or "accounting","Storekeeper"=>key=="inventory","Cashier"=>key is "sales" or "expenses",_=>false};}
 public static bool HasRole(ClaimsPrincipal p,params string[] roles)=>p.Claims.Any(c=>(c.Type==ClaimTypes.Role||c.Type=="role"||c.Type.EndsWith("/role",StringComparison.OrdinalIgnoreCase))&&roles.Contains(c.Value,StringComparer.OrdinalIgnoreCase));
 public static bool IsDemo(ClaimsPrincipal principal)=>principal.FindFirst("dukora_demo")?.Value=="true";
}

public static class LoginProtection
{
 private sealed record Attempt(int Count, DateTimeOffset WindowStartedAt, DateTimeOffset? BlockedUntil);
 private static readonly ConcurrentDictionary<string,Attempt> Attempts=new(StringComparer.Ordinal);
 private static readonly TimeSpan Window=TimeSpan.FromMinutes(5),Cooldown=TimeSpan.FromMinutes(1);
 public static TimeSpan? Remaining(string key){var now=DateTimeOffset.UtcNow;if(!Attempts.TryGetValue(key,out var attempt))return null;if(attempt.BlockedUntil is DateTimeOffset blocked&&blocked>now)return blocked-now;if(now-attempt.WindowStartedAt>Window){Attempts.TryRemove(key,out _);return null;}return null;}
 public static TimeSpan? Failed(string key){var now=DateTimeOffset.UtcNow;var attempt=Attempts.AddOrUpdate(key,_=>new Attempt(1,now,null),(_,old)=>now-old.WindowStartedAt>Window?new Attempt(1,now,null):new Attempt(old.Count+1,old.WindowStartedAt,old.BlockedUntil));if(attempt.Count>=5){var until=now+Cooldown;Attempts[key]=new Attempt(0,now,until);return Cooldown;}return null;}
 public static void Succeeded(string key)=>Attempts.TryRemove(key,out _);
}
