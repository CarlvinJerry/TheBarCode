using System.Security.Cryptography;
using System.Text;

namespace TheBarcode.Api;

public sealed class SecretProtector(string applicationSecret)
{
    readonly byte[] key=SHA256.HashData(Encoding.UTF8.GetBytes(applicationSecret));
    public string Protect(string value){var nonce=RandomNumberGenerator.GetBytes(12);var plain=Encoding.UTF8.GetBytes(value);var cipher=new byte[plain.Length];var tag=new byte[16];using var aes=new AesGcm(key,16);aes.Encrypt(nonce,plain,cipher,tag);return Convert.ToBase64String(nonce.Concat(tag).Concat(cipher).ToArray());}
    public string Unprotect(string value){var data=Convert.FromBase64String(value);var nonce=data[..12];var tag=data[12..28];var cipher=data[28..];var plain=new byte[cipher.Length];using var aes=new AesGcm(key,16);aes.Decrypt(nonce,cipher,tag,plain);return Encoding.UTF8.GetString(plain);}
}
