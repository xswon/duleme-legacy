#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use reqwest::{
    header::{ACCEPT, LOCATION},
    redirect::Policy,
    Client,
};
use roxmltree::{Document, Node};
use serde::Serialize;
use std::{
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    time::Duration,
};
use tokio::net::lookup_host;
use url::{Host, Url};

const RSS_FETCH_TIMEOUT: Duration = Duration::from_secs(45);
const MAX_RSS_BYTES: usize = 15 * 1024 * 1024;
const MAX_REDIRECTS: usize = 3;
const RSS_ACCEPT: &str =
    "application/rss+xml, application/atom+xml, application/xml, text/xml, */*";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RssItem {
    id: String,
    title: String,
    link: String,
    content: String,
    snippet: String,
    pub_date: String,
    author: Option<String>,
    thumbnail: Option<String>,
    audio_url: Option<String>,
    duration: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RssParseResponse {
    title: String,
    description: String,
    link: String,
    feed_url: String,
    favicon: String,
    feed_image: Option<String>,
    item_count: usize,
    items: Vec<RssItem>,
}

fn clean_text(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn node_text(node: Node<'_, '_>) -> Option<String> {
    let mut text = String::new();
    for part in node
        .descendants()
        .filter(|descendant| descendant.is_text())
        .filter_map(|descendant| descendant.text())
    {
        text.push_str(part);
    }
    clean_text(&text)
}

fn child_element<'a>(node: Node<'a, 'a>, name: &str) -> Option<Node<'a, 'a>> {
    node.children().find(|child| {
        child.is_element() && child.tag_name().name().eq_ignore_ascii_case(name)
    })
}

fn child_text(node: Node<'_, '_>, names: &[&str]) -> Option<String> {
    node.children()
        .find(|child| {
            child.is_element()
                && names
                    .iter()
                    .any(|name| child.tag_name().name().eq_ignore_ascii_case(name))
        })
        .and_then(node_text)
}

fn preferred_link(node: Node<'_, '_>) -> Option<String> {
    let mut fallback = None;
    for child in node.children().filter(|child| {
        child.is_element() && child.tag_name().name().eq_ignore_ascii_case("link")
    }) {
        if let Some(href) = child.attribute("href").and_then(clean_text) {
            let rel = child.attribute("rel").unwrap_or("alternate");
            if rel.eq_ignore_ascii_case("alternate") || rel.is_empty() {
                return Some(href);
            }
            if fallback.is_none() && !rel.eq_ignore_ascii_case("self") {
                fallback = Some(href);
            }
        } else if let Some(text) = node_text(child) {
            return Some(text);
        }
    }
    fallback
}

fn resolve_reference(base: &Url, value: Option<String>) -> Option<String> {
    let value = value?;
    match Url::parse(&value) {
        Ok(url) => Some(url.to_string()),
        Err(_) => base.join(&value).ok().map(|url| url.to_string()).or(Some(value)),
    }
}

fn image_url(node: Node<'_, '_>, base: &Url) -> Option<String> {
    for child in node.children().filter(|child| child.is_element()) {
        let name = child.tag_name().name();
        if name.eq_ignore_ascii_case("thumbnail") {
            if let Some(url) = child.attribute("url").and_then(clean_text) {
                return resolve_reference(base, Some(url));
            }
        }
        if name.eq_ignore_ascii_case("image") {
            if let Some(url) = child
                .attribute("href")
                .or_else(|| child.attribute("url"))
                .and_then(clean_text)
            {
                return resolve_reference(base, Some(url));
            }
        }
        if name.eq_ignore_ascii_case("content")
            && child
                .attribute("medium")
                .is_some_and(|value| value.eq_ignore_ascii_case("image"))
        {
            if let Some(url) = child.attribute("url").and_then(clean_text) {
                return resolve_reference(base, Some(url));
            }
        }
    }
    None
}

fn feed_image(node: Node<'_, '_>, base: &Url) -> Option<String> {
    if let Some(image) = child_element(node, "image") {
        if let Some(url) = child_text(image, &["url"]) {
            return resolve_reference(base, Some(url));
        }
        if let Some(url) = image
            .attribute("href")
            .or_else(|| image.attribute("url"))
            .and_then(clean_text)
        {
            return resolve_reference(base, Some(url));
        }
    }
    resolve_reference(base, child_text(node, &["logo", "icon"]))
}

fn enclosure_audio(node: Node<'_, '_>, base: &Url) -> Option<String> {
    for child in node.children().filter(|child| child.is_element()) {
        let name = child.tag_name().name();
        if name.eq_ignore_ascii_case("enclosure") {
            let url = child.attribute("url").and_then(clean_text)?;
            let media_type = child.attribute("type").unwrap_or("");
            if media_type.starts_with("audio/")
                || url.ends_with(".mp3")
                || url.ends_with(".m4a")
                || url.ends_with(".aac")
                || url.ends_with(".ogg")
                || url.ends_with(".wav")
            {
                return resolve_reference(base, Some(url));
            }
        }
        if name.eq_ignore_ascii_case("link")
            && child
                .attribute("rel")
                .is_some_and(|rel| rel.eq_ignore_ascii_case("enclosure"))
        {
            let media_type = child.attribute("type").unwrap_or("");
            if media_type.is_empty() || media_type.starts_with("audio/") {
                if let Some(url) = child.attribute("href").and_then(clean_text) {
                    return resolve_reference(base, Some(url));
                }
            }
        }
    }
    None
}

fn author_text(node: Node<'_, '_>) -> Option<String> {
    if let Some(value) = child_text(node, &["creator"]) {
        return Some(value);
    }
    let author = node.children().find(|child| {
        child.is_element() && child.tag_name().name().eq_ignore_ascii_case("author")
    })?;
    child_text(author, &["name"]).or_else(|| node_text(author))
}

fn strip_html(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut in_tag = false;
    for ch in value.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                output.push(' ');
            }
            _ if !in_tag => output.push(ch),
            _ => {}
        }
    }
    output.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn parse_item(node: Node<'_, '_>, base: &Url, index: usize) -> RssItem {
    let title = child_text(node, &["title"]).unwrap_or_else(|| "Untitled".to_string());
    let link = resolve_reference(base, preferred_link(node)).unwrap_or_default();
    let content = child_text(node, &["encoded", "content", "description", "summary"])
        .unwrap_or_default();
    let summary_source =
        child_text(node, &["summary", "description"]).unwrap_or_else(|| content.clone());
    let snippet = strip_html(&summary_source).chars().take(500).collect::<String>();
    let pub_date =
        child_text(node, &["pubDate", "published", "updated", "date"]).unwrap_or_default();
    let id = child_text(node, &["guid", "id"])
        .or_else(|| (!link.is_empty()).then(|| link.clone()))
        .unwrap_or_else(|| format!("{title}|{pub_date}|{index}"));

    RssItem {
        id,
        title,
        link,
        content,
        snippet,
        pub_date,
        author: author_text(node),
        thumbnail: image_url(node, base),
        audio_url: enclosure_audio(node, base),
        duration: child_text(node, &["duration"]),
    }
}

fn parse_feed(xml: &[u8], requested_url: &str, effective_url: &Url) -> Result<RssParseResponse, String> {
    let xml = String::from_utf8_lossy(xml);
    let document = Document::parse(&xml).map_err(|error| format!("Invalid RSS/Atom XML: {error}"))?;
    let root = document.root_element();
    let root_name = root.tag_name().name().to_ascii_lowercase();

    let (metadata, item_parent, item_name) = match root_name.as_str() {
        "rss" => {
            let channel = root
                .children()
                .find(|child| {
                    child.is_element()
                        && child.tag_name().name().eq_ignore_ascii_case("channel")
                })
                .ok_or_else(|| "RSS channel is missing".to_string())?;
            (channel, channel, "item")
        }
        "feed" => (root, root, "entry"),
        "rdf" => {
            let channel = root
                .children()
                .find(|child| {
                    child.is_element()
                        && child.tag_name().name().eq_ignore_ascii_case("channel")
                })
                .unwrap_or(root);
            (channel, root, "item")
        }
        "channel" => (root, root, "item"),
        _ => return Err("Unsupported RSS/Atom document".to_string()),
    };

    let title = child_text(metadata, &["title"]).unwrap_or_else(|| "Untitled Feed".to_string());
    let description = child_text(metadata, &["description", "subtitle"]).unwrap_or_default();
    let link = resolve_reference(effective_url, preferred_link(metadata))
        .unwrap_or_else(|| effective_url.to_string());
    let favicon = Url::parse(&link)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .map(|host| format!("https://www.google.com/s2/favicons?domain={host}&sz=64"))
        .unwrap_or_default();
    let image = feed_image(metadata, effective_url).or_else(|| {
        (!favicon.is_empty()).then(|| favicon.clone())
    });
    let items = item_parent
        .children()
        .filter(|child| {
            child.is_element()
                && child.tag_name().name().eq_ignore_ascii_case(item_name)
        })
        .enumerate()
        .map(|(index, item)| parse_item(item, effective_url, index))
        .collect::<Vec<_>>();

    Ok(RssParseResponse {
        title,
        description,
        link,
        feed_url: requested_url.to_string(),
        favicon,
        feed_image: image,
        item_count: items.len(),
        items,
    })
}

fn blocked_hostname(hostname: &str) -> bool {
    let hostname = hostname.trim_end_matches('.').to_ascii_lowercase();
    matches!(
        hostname.as_str(),
        "localhost"
            | "instance-data"
            | "instance-data.ec2.internal"
            | "metadata.google.internal"
            | "metadata.goog"
    ) || hostname.ends_with(".localhost")
        || hostname.ends_with(".local")
        || hostname.ends_with(".internal")
        || hostname.ends_with(".home.arpa")
}

fn is_public_ipv4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    if ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_unspecified()
        || ip.is_multicast()
    {
        return false;
    }
    if octets[0] == 0 || octets[0] >= 224 {
        return false;
    }
    if octets[0] == 100 && (64..=127).contains(&octets[1]) {
        return false;
    }
    if octets[0] == 192 && octets[1] == 0 && octets[2] == 0 {
        return false;
    }
    if octets[0] == 192 && octets[1] == 88 && octets[2] == 99 {
        return false;
    }
    if octets[0] == 198 && (octets[1] == 18 || octets[1] == 19) {
        return false;
    }
    true
}

fn starts_with(ip: Ipv6Addr, prefix: &[u8]) -> bool {
    ip.octets().starts_with(prefix)
}

fn is_public_ipv6(ip: Ipv6Addr) -> bool {
    if let Some(ipv4) = ip.to_ipv4() {
        return is_public_ipv4(ipv4);
    }
    let octets = ip.octets();
    if ip.is_loopback() || ip.is_unspecified() || ip.is_multicast() {
        return false;
    }
    if octets[0] & 0xfe == 0xfc {
        return false;
    }
    if octets[0] == 0xfe && octets[1] & 0xc0 == 0x80 {
        return false;
    }
    if starts_with(ip, &[0x20, 0x01, 0x0d, 0xb8])
        || starts_with(ip, &[0x20, 0x02])
        || starts_with(ip, &[0x20, 0x01, 0x00, 0x00])
        || starts_with(ip, &[0x00, 0x64, 0xff, 0x9b])
    {
        return false;
    }
    true
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_public_ipv4(ip),
        IpAddr::V6(ip) => is_public_ipv6(ip),
    }
}

fn validate_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "Feed URL is invalid".to_string())?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Feed URL must be a public http/https URL".to_string());
    }
    Ok(url)
}

async fn pinned_resolution(url: &Url) -> Result<Option<(String, SocketAddr)>, String> {
    let host = url.host().ok_or_else(|| "Feed URL has no hostname".to_string())?;
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "Feed URL has no usable port".to_string())?;

    match host {
        Host::Ipv4(ip) => {
            if !is_public_ipv4(ip) {
                return Err("Feed URL resolves to a non-public address".to_string());
            }
            Ok(None)
        }
        Host::Ipv6(ip) => {
            if !is_public_ipv6(ip) {
                return Err("Feed URL resolves to a non-public address".to_string());
            }
            Ok(None)
        }
        Host::Domain(hostname) => {
            let hostname = hostname.trim_end_matches('.').to_ascii_lowercase();
            if blocked_hostname(&hostname) {
                return Err("Feed URL hostname is not public".to_string());
            }
            let addresses = lookup_host((hostname.as_str(), port))
                .await
                .map_err(|error| format!("Unable to resolve feed hostname: {error}"))?
                .collect::<Vec<_>>();
            if addresses.is_empty() || addresses.iter().any(|address| !is_public_ip(address.ip())) {
                return Err("Feed hostname resolves to a non-public address".to_string());
            }
            Ok(Some((hostname, addresses[0])))
        }
    }
}

async fn client_for(url: &Url) -> Result<Client, String> {
    let pin = pinned_resolution(url).await?;
    let mut builder = Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(RSS_FETCH_TIMEOUT)
        .user_agent("Duleme/0.1 Tauri RSS reader");
    if let Some((hostname, address)) = pin {
        builder = builder.resolve(&hostname, address);
    }
    builder
        .build()
        .map_err(|error| format!("Unable to create HTTP client: {error}"))
}

async fn fetch_feed_bytes(raw_url: &str) -> Result<(Vec<u8>, Url), String> {
    let mut current = validate_url(raw_url)?;

    for redirect_count in 0..=MAX_REDIRECTS {
        let client = client_for(&current).await?;
        let mut response = client
            .get(current.clone())
            .header(ACCEPT, RSS_ACCEPT)
            .send()
            .await
            .map_err(|error| format!("Failed to fetch RSS feed: {error}"))?;

        if response.status().is_redirection() {
            if redirect_count == MAX_REDIRECTS {
                return Err("RSS feed redirected too many times".to_string());
            }
            let location = response
                .headers()
                .get(LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| "RSS redirect is missing a valid Location header".to_string())?;
            current = current
                .join(location)
                .map_err(|_| "RSS redirect target is invalid".to_string())?;
            current = validate_url(current.as_str())?;
            continue;
        }

        if !response.status().is_success() {
            return Err(format!(
                "HTTP {}: failed to fetch RSS feed",
                response.status().as_u16()
            ));
        }

        if response
            .content_length()
            .is_some_and(|length| length > MAX_RSS_BYTES as u64)
        {
            return Err("RSS feed response is too large".to_string());
        }

        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("Failed while reading RSS feed: {error}"))?
        {
            if body.len().saturating_add(chunk.len()) > MAX_RSS_BYTES {
                return Err("RSS feed response is too large".to_string());
            }
            body.extend_from_slice(&chunk);
        }
        return Ok((body, current));
    }

    Err("RSS fetch failed".to_string())
}

#[tauri::command]
async fn fetch_rss(url: String) -> Result<RssParseResponse, String> {
    let (body, effective_url) = fetch_feed_bytes(&url).await?;
    parse_feed(&body, &url, &effective_url)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_rss])
        .run(tauri::generate_context!())
        .expect("error while running Duleme");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_ip_policy_blocks_local_and_special_ranges() {
        for address in [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.1",
            "192.168.1.1",
            "169.254.1.1",
            "100.64.0.1",
            "198.18.0.1",
            "::1",
            "fc00::1",
            "fe80::1",
            "2001:db8::1",
        ] {
            assert!(!is_public_ip(address.parse().unwrap()), "{address}");
        }
        assert!(is_public_ip("1.1.1.1".parse().unwrap()));
        assert!(is_public_ip("2606:4700:4700::1111".parse().unwrap()));
    }

    #[test]
    fn parser_handles_basic_rss_and_podcast_enclosure() {
        let xml = br#"<?xml version="1.0"?>
          <rss version="2.0">
            <channel>
              <title>Example Feed</title>
              <link>https://example.com/</link>
              <description>Example description</description>
              <item>
                <guid>episode-1</guid>
                <title>Episode One</title>
                <link>https://example.com/1</link>
                <description><![CDATA[<p>Hello world</p>]]></description>
                <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
                <enclosure url="https://cdn.example.com/1.mp3" type="audio/mpeg"/>
              </item>
            </channel>
          </rss>"#;
        let base = Url::parse("https://example.com/feed.xml").unwrap();
        let parsed = parse_feed(xml, base.as_str(), &base).unwrap();
        assert_eq!(parsed.title, "Example Feed");
        assert_eq!(parsed.item_count, 1);
        assert_eq!(parsed.items[0].id, "episode-1");
        assert_eq!(
            parsed.items[0].audio_url.as_deref(),
            Some("https://cdn.example.com/1.mp3")
        );
        assert_eq!(parsed.items[0].snippet, "Hello world");
    }
}
