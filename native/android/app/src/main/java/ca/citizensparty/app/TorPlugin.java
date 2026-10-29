package ca.citizensparty.app;

// Tor inside the app, for ballots only (app/adapter-nostr.js, "Tor"). Everything else uses the app's normal
// connections. Tor starts quietly when the app opens; a ballot is then sent over a fresh Tor connection to
// each host's Tor address (or its usual address, through Tor, when it has none), so no host learns who sent it.
//
//   CitizensTor.start()                       start Tor (no-op if it's already running)
//   CitizensTor.status()                      {state: "off" | "starting" | "on" | "error", error}
//   CitizensTor.send({url, msg, id, timeout}) send one message, wait for the host's ["OK", id, ok, message]

import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.os.IBinder;

import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.torproject.jni.TorService;

import java.net.InetSocketAddress;
import java.net.Proxy;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

@CapacitorPlugin(name = "CitizensTor")
public class TorPlugin extends Plugin {
    private volatile String state = "off";
    private volatile String error = "";
    private volatile TorService service;
    private boolean bound = false;

    private final ServiceConnection conn = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
            service = ((TorService.LocalBinder) binder).getService();
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            service = null;
            bound = false;
            state = "off";
        }
    };

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (TorService.ACTION_ERROR.equals(intent.getAction())) {
                state = "error";
                error = String.valueOf(intent.getStringExtra(Intent.EXTRA_TEXT));
                return;
            }
            String s = intent.getStringExtra(TorService.EXTRA_STATUS);
            if (TorService.STATUS_ON.equals(s)) state = "on";
            else if (TorService.STATUS_STARTING.equals(s)) state = "starting";
            else if (TorService.STATUS_OFF.equals(s) || TorService.STATUS_STOPPING.equals(s)) {
                state = "off";
                bound = false;
            }
        }
    };

    @Override
    public void load() {
        IntentFilter f = new IntentFilter(TorService.ACTION_STATUS);
        f.addAction(TorService.ACTION_ERROR);
        LocalBroadcastManager.getInstance(getContext()).registerReceiver(receiver, f);
    }

    @Override
    protected void handleOnDestroy() {
        LocalBroadcastManager.getInstance(getContext()).unregisterReceiver(receiver);
        if (bound) {
            try {
                getContext().unbindService(conn);
            } catch (Exception ignored) {
            }
        }
    }

    // Starting again after an error restarts Tor (an error, e.g. while the network changed, used to stick until the
    // app was closed, so every ballot after it gave up within seconds).
    private synchronized void startTor() {
        if (bound && !"error".equals(state)) return;
        if (bound) {
            try {
                getContext().unbindService(conn);
            } catch (Exception ignored) {
            }
            try {
                getContext().stopService(new Intent(getContext(), TorService.class));
            } catch (Exception ignored) {
            }
            service = null;
            bound = false;
        }
        bound = true;
        state = "starting";
        error = "";
        try { // Tor's own settings: its progress goes to the Android log (adb logcat -s TorService)
            java.io.File rc = TorService.getTorrc(getContext());
            java.nio.file.Files.write(rc.toPath(), "Log notice syslog\n".getBytes());
        } catch (Exception ignored) {
        }
        getContext().bindService(new Intent(getContext(), TorService.class), conn, Context.BIND_AUTO_CREATE);
    }

    @PluginMethod
    public void start(PluginCall call) {
        startTor();
        call.resolve(statusObj());
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusObj());
    }

    private JSObject statusObj() {
        JSObject o = new JSObject();
        o.put("state", state);
        o.put("error", error);
        return o;
    }

    @PluginMethod
    public void send(PluginCall call) {
        String url = call.getString("url", "");
        String msg = call.getString("msg", "");
        String id = call.getString("id", "");
        int timeout = call.getInt("timeout", 60000);
        TorService s = service;
        int port = s == null ? -1 : s.getSocksPort();
        if (!"on".equals(state) || port <= 0) {
            call.resolve(result(false, "tor: not ready"));
            return;
        }
        sendVia(port, url, msg, id, timeout, (ok, m) -> call.resolve(result(ok, m)));
    }

    private static JSObject result(boolean ok, String message) {
        JSObject o = new JSObject();
        o.put("ok", ok);
        o.put("message", message);
        return o;
    }

    interface Done {
        void done(boolean ok, String message);
    }

    // One fresh WebSocket through Tor's SOCKS port: the address (.onion or not) is looked up inside Tor.
    static void sendVia(int socksPort, String url, String msg, String id, int timeoutMs, Done cb) {
        OkHttpClient client = new OkHttpClient.Builder()
                .proxy(new Proxy(Proxy.Type.SOCKS, new InetSocketAddress("127.0.0.1", socksPort)))
                .connectTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .callTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                .build();
        AtomicBoolean finished = new AtomicBoolean(false);
        Done once = (ok, m) -> {
            if (finished.compareAndSet(false, true)) {
                cb.done(ok, m);
                client.dispatcher().executorService().shutdown();
            }
        };
        String httpUrl = url.replaceFirst("^ws://", "http://").replaceFirst("^wss://", "https://");
        WebSocket ws = client.newWebSocket(new Request.Builder().url(httpUrl).build(), new WebSocketListener() {
            @Override
            public void onOpen(WebSocket w, Response response) {
                w.send(msg);
            }

            @Override
            public void onMessage(WebSocket w, String text) {
                try {
                    JSONArray a = new JSONArray(text);
                    if ("OK".equals(a.optString(0)) && id.equals(a.optString(1))) {
                        once.done(a.optBoolean(2), a.optString(3, ""));
                        w.close(1000, null);
                    }
                } catch (Exception ignored) {
                }
            }

            @Override
            public void onClosed(WebSocket w, int code, String reason) {
                once.done(false, "closed");
            }

            @Override
            public void onFailure(WebSocket w, Throwable t, Response response) {
                once.done(false, "unreachable: " + t.getClass().getSimpleName() + " " + t.getMessage());
            }
        });
        new Thread(() -> {
            try {
                Thread.sleep(timeoutMs);
            } catch (InterruptedException ignored) {
            }
            if (!finished.get()) {
                ws.cancel();
                once.done(false, "timeout");
            }
        }).start();
    }
}
