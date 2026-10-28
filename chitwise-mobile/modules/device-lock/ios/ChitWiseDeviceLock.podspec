Pod::Spec.new do |s|
  s.name = 'ChitWiseDeviceLock'
  s.version = '1.0.0'
  s.summary = 'Protect ChitWise windows while device authentication is required'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'ChitWise'
  s.homepage = 'https://github.com/saisrinivasgada/chitfund-platform'
  s.source = { :git => 'https://github.com/saisrinivasgada/chitfund-platform.git' }
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
