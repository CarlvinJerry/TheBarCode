using System.Security.Cryptography; using Microsoft.IdentityModel.Tokens; using System.IdentityModel.Tokens.Jwt; using System.Security.Claims; using System.Text;
namespace TheBarcode.Api;
public static class Security
{
 public static string HashPin(string pin){var salt=RandomNumberGenerator.GetBytes(16);var hash=Rfc2898DeriveBytes.Pbkdf2(pin,salt,120_000,HashAlgorithmName.SHA256,32);return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";}
 public static bool VerifyPin(string pin,string stored){var p=stored.Split('.');if(p.Length!=2)return false;var salt=Convert.FromBase64String(p[0]);var expected=Convert.FromBase64String(p[1]);var actual=Rfc2898DeriveBytes.Pbkdf2(pin,salt,120_000,HashAlgorithmName.SHA256,32);return CryptographicOperations.FixedTimeEquals(expected,actual);}
 public static string Token(StaffUser user,string key){var creds=new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),SecurityAlgorithms.HmacSha256);return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(claims:[new(ClaimTypes.NameIdentifier,user.Id.ToString()),new(ClaimTypes.Name,user.Name),new(ClaimTypes.Role,user.Role)],expires:DateTime.UtcNow.AddHours(12),signingCredentials:creds));}
}
