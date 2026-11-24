# Puppet host baseline

Puppet owns only host time synchronization and the SSH baseline. Ansible owns Docker, the CRICPSR deploy user, Compose, application releases, and backups. Keep these ownership boundaries separate; do not add SSH or chrony resources to the Ansible playbook.

On supported Debian/Ubuntu hosts, verify that an operator public key works in a second SSH session before applying this manifest. It disables password SSH and root SSH login:

```sh
sudo puppet apply provisioning/puppet/manifests/site.pp
sudo sshd -t
sudo systemctl status ssh chrony
```

Keep the current SSH session open until a new key-authenticated session succeeds. Provisioning does not create cloud users, authorize keys, or change firewall rules.
