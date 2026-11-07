# Rendered per droplet by scripts/deploy.sh and installed as
# /etc/nginx/snippets/tls.conf. __CERT_NAME__ is the Let's Encrypt lineage name
# (the first -d name given to certbot).
ssl_certificate     /etc/letsencrypt/live/__CERT_NAME__/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/__CERT_NAME__/privkey.pem;

# Mozilla "intermediate" profile.
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
ssl_prefer_server_ciphers off;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;
