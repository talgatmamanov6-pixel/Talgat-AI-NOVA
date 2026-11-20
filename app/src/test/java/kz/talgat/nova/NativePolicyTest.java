package kz.talgat.nova;
import org.junit.Test;
import static org.junit.Assert.*;
public class NativePolicyTest {
 @Test public void exactHttpsOriginOnly() {
  assertTrue(NativePolicy.trusted("https://talgat-ai.netlify.app/"));
  assertTrue(NativePolicy.trusted("https://talgat-ai.netlify.app:443/api/chat"));
  for(String url:new String[]{"http://talgat-ai.netlify.app/","https://talgat-ai.netlify.app.evil.test/","https://talgat-ai.netlify.app@evil.test/","https://user@talgat-ai.netlify.app/","https://talgat-ai.netlify.app:8443/","file:///etc/passwd","blob:https://talgat-ai.netlify.app/test","about:srcdoc","https://evil.test/?https://talgat-ai.netlify.app/"}) assertFalse(url,NativePolicy.trusted(url));
 }
 @Test public void documentNamesAndMimeTypesAreBounded() {
  assertEquals("план.svg",NativePolicy.filename("план.svg"));
  assertEquals("talgat-file.bin",NativePolicy.filename(".."));
  assertFalse(NativePolicy.filename("../../bad\nname.zip").contains("/"));
  assertEquals("application/zip",NativePolicy.mime("application/zip"));
  assertEquals("application/octet-stream",NativePolicy.mime("text/html\nInjected"));
 }
}
