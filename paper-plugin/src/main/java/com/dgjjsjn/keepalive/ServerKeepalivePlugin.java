package com.dgjjsjn.keepalive;

import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitRunnable;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public class ServerKeepalivePlugin extends JavaPlugin {

    private String websiteUrl;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        websiteUrl = getConfig().getString("website-url", "https://bot-server-24lv.onrender.com/ping");

        getLogger().info("ServerKeepalive enabled. Pinging " + websiteUrl + " every 5 minutes.");

        // Run every 5 minutes (6000 ticks = 300 seconds)
        new BukkitRunnable() {
            @Override
            public void run() {
                pingWebsite();
            }
        }.runTaskTimerAsynchronously(this, 0L, 6000L);
    }

    private void pingWebsite() {
        try {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .build();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(websiteUrl))
                    .GET()
                    .timeout(Duration.ofSeconds(10))
                    .build();

            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

            getLogger().info("Pinged keepalive website: HTTP " + response.statusCode()
                    + " | " + response.body());
        } catch (Exception e) {
            getLogger().warning("Failed to ping keepalive website: " + e.getMessage());
        }
    }
}
