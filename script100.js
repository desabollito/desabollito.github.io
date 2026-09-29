angular
    .module('webApp')
    .controller('accionController', ['$scope', '$location', 'session', accionController]);

function accionController($scope, $location, session) {
    var vm = this;

    //var solicitud = session.get(0);
    //if (typeof (solicitud) === "undefined") {
    //    $location.path('/');
    //    return;
    //}
}