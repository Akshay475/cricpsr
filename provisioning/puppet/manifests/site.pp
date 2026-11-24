class cricpsr_host_baseline {
  package { 'chrony':
    ensure => installed,
  }

  service { 'chrony':
    ensure  => running,
    enable  => true,
    require => Package['chrony'],
  }

  file { '/etc/ssh/sshd_config.d':
    ensure => directory,
    owner  => 'root',
    group  => 'root',
    mode   => '0755',
  }

  file { '/etc/ssh/sshd_config.d/60-cricpsr.conf':
    ensure  => file,
    owner   => 'root',
    group   => 'root',
    mode    => '0644',
    content => "PermitRootLogin no\nPasswordAuthentication no\nPubkeyAuthentication yes\n",
    require => File['/etc/ssh/sshd_config.d'],
    notify  => Service['ssh'],
  }

  service { 'ssh':
    ensure => running,
    enable => true,
  }
}

include cricpsr_host_baseline
