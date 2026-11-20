package kz.talgat.nova;

import java.net.URI;

final class NativePolicy {
 static final String SITE = "https://talgat-ai.netlify.app/";
 static final int MAX_BYTES = 12 * 1024 * 1024;
 static boolean trusted(String value) {
  try {
   URI uri = new URI(value);
   return "https".equalsIgnoreCase(uri.getScheme())
    && "talgat-ai.netlify.app".equalsIgnoreCase(uri.getHost())
    && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
  } catch (Exception ignored) { return false; }
 }
 static String filename(String value) {
  String name = value == null ? "" : value.replaceAll("[\\p{Cntrl}/\\\\:*?\"<>|]", "_").trim();
  if (name.isEmpty() || name.equals(".") || name.equals("..")) return "talgat-file.bin";
  return name.length() > 120 ? name.substring(name.length() - 120) : name;
 }
 static String mime(String value) {
  return value != null && value.length() < 100 && value.matches("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+")
   ? value : "application/octet-stream";
 }
}
