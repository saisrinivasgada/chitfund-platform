import ExpoModulesCore
import UIKit

public final class ChitWiseDeviceLockModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChitWiseDeviceLock")
    View(DeviceLockView.self) {
      Events("onUnlockPress", "onSignOutPress")
      Prop("active") { (view: DeviceLockView, value: Bool) in view.active = value }
      Prop("protectionEnabled") { (view: DeviceLockView, value: Bool) in view.protectionEnabled = value }
      Prop("busy") { (view: DeviceLockView, value: Bool) in view.busy = value }
      Prop("message") { (view: DeviceLockView, value: String) in view.message = value }
      Prop("title") { (view: DeviceLockView, value: String) in view.title = value }
      Prop("buttonTitle") { (view: DeviceLockView, value: String) in view.buttonTitle = value }
      Prop("canSignOut") { (view: DeviceLockView, value: Bool) in view.canSignOut = value }
      OnViewDidUpdateProps { (view: DeviceLockView) in view.applyProps() }
    }
  }
}

/// A separate app-owned window covers sheets and alerts without presenting a
/// second modal from a controller which already has a presented controller.
final class DeviceLockView: ExpoView {
  let onUnlockPress = EventDispatcher()
  let onSignOutPress = EventDispatcher()
  var active = false
  var protectionEnabled = false
  var busy = false
  var message = ""
  var title = "ChitWise is locked"
  var buttonTitle = "Unlock ChitWise"
  var canSignOut = false
  private var privacyHold = false
  private var overlay: UIWindow?
  private weak var previousKeyWindow: UIWindow?
  private var observers: [NSObjectProtocol] = []

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isAccessibilityElement = false
    observers.append(NotificationCenter.default.addObserver(
      forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
    ) { [weak self] _ in
      guard let self, self.protectionEnabled else { return }
      // Cover synchronously, before the application-switcher snapshot. Keep the
      // cover until JS has processed foreground/session state; never hide it
      // merely because an OS authentication dialog returned to the app.
      self.privacyHold = true
      self.renderOverlay()
    })
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { dismissOverlay() } else { renderOverlay() }
  }

  func applyProps() {
    if !protectionEnabled || UIApplication.shared.applicationState == .active {
      privacyHold = false
    }
    renderOverlay()
  }

  private func renderOverlay() {
    guard active || (protectionEnabled && privacyHold) else { dismissOverlay(); return }
    guard let scene = window?.windowScene else { return }
    if overlay == nil {
      previousKeyWindow = scene.windows.first(where: { $0.isKeyWindow })
      let controller = DeviceLockController()
      controller.unlock = { [weak self] in self?.onUnlockPress([:]) }
      controller.signOut = { [weak self] in self?.onSignOutPress([:]) }
      let curtain = UIWindow(windowScene: scene)
      curtain.windowLevel = UIWindow.Level(rawValue: UIWindow.Level.alert.rawValue + 1)
      curtain.rootViewController = controller
      curtain.accessibilityIdentifier = "chitwise-device-lock-window"
      overlay = curtain
      // Native sign-out confirmations must be presented above this curtain,
      // rather than becoming inaccessible in the protected window underneath.
      curtain.makeKeyAndVisible()
    }
    (overlay?.rootViewController as? DeviceLockController)?.configure(
      title: title, message: message, buttonTitle: buttonTitle,
      busy: busy || UIApplication.shared.applicationState != .active,
      canSignOut: canSignOut
    )
  }

  private func dismissOverlay() {
    guard let curtain = overlay else { return }
    let restoreKey = curtain.isKeyWindow
    curtain.isHidden = true
    curtain.rootViewController = nil
    overlay = nil
    if restoreKey { previousKeyWindow?.makeKey() }
    previousKeyWindow = nil
  }

  deinit {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    overlay?.isHidden = true
  }
}

private final class DeviceLockController: UIViewController {
  var unlock: (() -> Void)?
  var signOut: (() -> Void)?
  private let heading = UILabel()
  private let explanation = UILabel()
  private let unlockButton = UIButton(type: .system)
  private let signOutButton = UIButton(type: .system)
  private let spinner = UIActivityIndicatorView(style: .medium)
  private let navy = UIColor(red: 30 / 255, green: 58 / 255, blue: 95 / 255, alpha: 1)

  override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = navy
    view.accessibilityViewIsModal = true
    let iconTile = UIView()
    iconTile.backgroundColor = UIColor.white.withAlphaComponent(0.10)
    iconTile.layer.cornerRadius = 24
    iconTile.translatesAutoresizingMaskIntoConstraints = false
    let icon = UIImageView(image: UIImage(systemName: "lock", withConfiguration: UIImage.SymbolConfiguration(pointSize: 36)))
    icon.tintColor = .white
    icon.translatesAutoresizingMaskIntoConstraints = false
    iconTile.addSubview(icon)
    NSLayoutConstraint.activate([
      iconTile.widthAnchor.constraint(equalToConstant: 80), iconTile.heightAnchor.constraint(equalToConstant: 80),
      icon.centerXAnchor.constraint(equalTo: iconTile.centerXAnchor), icon.centerYAnchor.constraint(equalTo: iconTile.centerYAnchor)
    ])
    heading.font = .systemFont(ofSize: 26, weight: .bold)
    heading.textColor = .white
    heading.textAlignment = .center
    heading.numberOfLines = 0
    heading.accessibilityIdentifier = "device-lock-title"
    explanation.font = .systemFont(ofSize: 16)
    explanation.textColor = UIColor.white.withAlphaComponent(0.75)
    explanation.numberOfLines = 0
    explanation.textAlignment = .center
    unlockButton.backgroundColor = .white
    unlockButton.setTitleColor(navy, for: .normal)
    unlockButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .bold)
    unlockButton.layer.cornerRadius = 16
    unlockButton.accessibilityIdentifier = "unlock-chitwise"
    unlockButton.addAction(UIAction { [weak self] _ in self?.unlock?() }, for: .touchUpInside)
    signOutButton.setTitle("Sign out", for: .normal)
    signOutButton.setTitleColor(UIColor.white.withAlphaComponent(0.75), for: .normal)
    signOutButton.accessibilityIdentifier = "device-lock-sign-out"
    signOutButton.addAction(UIAction { [weak self] _ in self?.signOut?() }, for: .touchUpInside)
    spinner.color = .white
    spinner.hidesWhenStopped = true
    let stack = UIStackView(arrangedSubviews: [iconTile, heading, explanation, spinner, unlockButton, signOutButton])
    stack.axis = .vertical
    stack.alignment = .center
    stack.spacing = 20
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    let preferredWidth = stack.widthAnchor.constraint(equalTo: view.safeAreaLayoutGuide.widthAnchor, constant: -64)
    preferredWidth.priority = .defaultHigh
    NSLayoutConstraint.activate([
      preferredWidth,
      stack.centerXAnchor.constraint(equalTo: view.centerXAnchor), stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      stack.widthAnchor.constraint(lessThanOrEqualToConstant: 420),
      stack.widthAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.widthAnchor, constant: -64),
      heading.widthAnchor.constraint(equalTo: stack.widthAnchor), explanation.widthAnchor.constraint(equalTo: stack.widthAnchor),
      unlockButton.heightAnchor.constraint(equalToConstant: 54), unlockButton.widthAnchor.constraint(equalToConstant: 240),
      signOutButton.heightAnchor.constraint(equalToConstant: 48)
    ])
  }

  func configure(title: String, message: String, buttonTitle: String, busy: Bool, canSignOut: Bool) {
    loadViewIfNeeded()
    heading.text = title
    explanation.text = message
    unlockButton.setTitle(buttonTitle, for: .normal)
    unlockButton.isHidden = busy
    signOutButton.isHidden = busy || !canSignOut
    busy ? spinner.startAnimating() : spinner.stopAnimating()
  }
}
