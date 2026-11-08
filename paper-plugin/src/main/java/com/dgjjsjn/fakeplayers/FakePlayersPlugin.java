package com.dgjjsjn.fakeplayers;

import org.bukkit.ChatColor;
import org.bukkit.Bukkit;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.server.ServerListPingEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitRunnable;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Random;

public class FakePlayersPlugin extends JavaPlugin implements Listener {

    private List<String> fakeNames;
    private int fakeOnline;
    private int fakeMax;
    private String websiteUrl;
    private int pingIntervalTicks;
    private final Random random = new Random();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        reloadConfig();

        fakeNames = getConfig().getStringList("fake-player-names");
        if (fakeNames == null || fakeNames.isEmpty()) {
            fakeNames = List.of("wembo", "Player1", "Guest", "Noob", "ProGamer");
        }
        fakeOnline = getConfig().getInt("fake-online-count", 3);
        fakeMax = getConfig().getInt("fake-max-players", 20);
        websiteUrl = getConfig().getString("website-url", "https://bot-server-24lv.onrender.com/ping");
        pingIntervalTicks = getConfig().getInt("ping-interval-seconds", 300) * 20;

        getServer().getPluginManager().registerEvents(this, this);

        // Runs every N seconds when the server has no real players
        new BukkitRunnable() {
            @Override
            public void run() {
                if (Bukkit.getOnlinePlayers().isEmpty()) {
                    String name = fakeNames.get(random.nextInt(fakeNames.size()));
                    Bukkit.broadcastMessage(ChatColor.GRAY + "[" + name + "] " + ChatColor.WHITE + "keepalive");
                }
                pingWebsite();
            }
        }.runTaskTimerAsynchronously(this, 0L, pingIntervalTicks);

        getLogger().info("FakePlayers enabled. Faking " + fakeOnline + " players in server list.");
    }

    @EventHandler
    public void onPing(ServerListPingEvent event) {
        event.setNumPlayers(fakeOnline);
        event.setMaxPlayers(fakeMax);
        event.setMotd(ChatColor.GREEN + "Players: " + fakeOnline + "/" + fakeMax + "\n" + ChatColor.WHITE + "Keepalive Active");
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
            getLogger().info("Pinged keepalive website: HTTP " + response.statusCode());
        } catch (Exception e) {
            getLogger().warning("Keepalive ping failed: " + e.getMessage());
        }
    }
}
