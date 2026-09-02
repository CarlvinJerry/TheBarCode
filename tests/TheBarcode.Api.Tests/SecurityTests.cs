using TheBarcode.Api;
using System.Security.Claims;
namespace TheBarcode.Api.Tests;
public sealed class SecurityTests
{
 [Fact] public void Pin_hash_round_trips(){var hash=Security.HashPin("638291");Assert.True(Security.VerifyPin("638291",hash));Assert.False(Security.VerifyPin("638292",hash));Assert.DoesNotContain("638291",hash);}
 [Fact] public void Same_pin_uses_unique_salts(){Assert.NotEqual(Security.HashPin("638291"),Security.HashPin("638291"));}
 [Fact] public void Token_contains_role(){var user=new StaffUser{Name="Owner",Role="Owner",PinHash="unused"};var token=Security.Token(user,"this-is-a-test-only-key-with-more-than-32-characters");Assert.NotEmpty(token);Assert.Equal(2,token.Count(x=>x=='.'));}
 [Fact] public void Explicit_permission_overrides_base_role_without_granting_unassigned_features(){var identity=new ClaimsIdentity([new Claim(ClaimTypes.Role,"Cashier"),new Claim("permission","reports")],"test");var principal=new ClaimsPrincipal(identity);Assert.True(Security.HasPermission(principal,"reports"));Assert.True(Security.HasPermission(principal,"sales"));Assert.False(Security.HasPermission(principal,"accounting"));}
 [Fact] public void Token_carries_explicit_permissions(){var user=new StaffUser{Name="Cashier",Role="Cashier",PinHash="unused",Permissions="reports"};var token=Security.Token(user,"this-is-a-test-only-key-with-more-than-32-characters");Assert.Contains("reports",new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().ReadJwtToken(token).Claims.Where(x=>x.Type=="permission").Select(x=>x.Value));}
}
