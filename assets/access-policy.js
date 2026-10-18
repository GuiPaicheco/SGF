(function (root) {
  'use strict';
  const publicRoutes = new Set(['home','quick','quick-result','login','recover-password','set-password']);
  const sessionRoutes = new Set(['choose-access','change-password','notifications','stored-receipt']);
  const routes = {
    servidor:new Set(['employee-dashboard','employee-detail']),
    diretor:new Set(['dashboard','detail','scale','audit-history']),
    rh:new Set(['dashboard','detail','scale','audit-history','catalogs','inclusions','inclusion-detail','access-requests','access-request-detail','employee-registry-detail','location-detail']),
    administrador:new Set(['dashboard','detail','scale','audit-history','catalogs','inclusions','inclusion-detail','access-requests','access-request-detail','employee-registry-detail','location-detail','reference-detail','profiles','profile-detail','profile-create','calendar-admin','rejection-catalog'])
  };
  routes.rh.add('bond-resources');
  routes.administrador.add('bond-resources');
  routes.administrador.add('organization');
  routes.administrador.add('cnes-import');
  routes.administrador.add('rh-accounts');
  routes.administrador.add('rh-calendar');
  routes.rh.add('choose-operator');
  routes.rh.add('rh-workspace');
  function allowed(route,role,session) {
    return publicRoutes.has(route) || Boolean(session && (sessionRoutes.has(route) || (Object.hasOwn(routes,role) && routes[role].has(route))));
  }
  function resolve(route,role,session,mustChangePassword) {
    if (session && mustChangePassword && !['change-password','set-password'].includes(route)) return 'change-password';
    if (session && !Object.hasOwn(routes,role) && !['set-password','change-password','choose-access'].includes(route)) return 'choose-access';
    if (allowed(route,role,session)) return route;
    return session ? role==='servidor' ? 'employee-dashboard' : Object.hasOwn(routes,role) ? 'dashboard' : 'choose-access' : 'login';
  }
  const capabilities={
    structure:['administrador'],permissions:['administrador'],calendar:['administrador'],
    archive:['rh','administrador'],timeBank:['rh','administrador'],minimumScale:['rh','administrador'],distribution:['servidor','rh','administrador'],
    review:['diretor','rh','administrador'],legacyOperation:['rh','administrador']
  };
  function can(capability,role,session=true) { return Boolean(session && Object.hasOwn(capabilities,capability) && capabilities[capability].includes(role)); }
  root.SGFAccessPolicy = {allowed,resolve,can};
})(globalThis);
