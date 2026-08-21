using TheBarcode.Api;
namespace TheBarcode.Api.Tests;
public sealed class SecurityTests
{
 [Fact] public void Pin_hash_round_trips(){var hash=Security.HashPin("638291");Assert.True(Security.VerifyPin("638291",hash));Assert.False(Security.VerifyPin("638292",hash));Assert.DoesNotContain("638291",hash);}
 [Fact] public void Same_pin_uses_unique_salts(){Assert.NotEqual(Security.HashPin("638291"),Security.HashPin("638291"));}
 [Fact] public void Token_contains_role(){var user=new StaffUser{Name="Owner",Role="Owner",PinHash="unused"};var token=Security.Token(user,"this-is-a-test-only-key-with-more-than-32-characters");Assert.NotEmpty(token);Assert.Equal(2,token.Count(x=>x=='.'));}
}
