angular
    .module('webApp')
    .controller('homeController', ['$rootScope', '$scope', '$http', '$routeParams', '$location', 'home', 'provincia', 'localidad', 'session', 'appConfig', homeController]);

function homeController($rootScope, $scope, $http, $routeParams, $location, home, provincia, localidad, session, appConfig) {
    var vm = this;
    session.clear();

    vm.MostrarInicio = true;
    vm.MostrarRequisitos = false;
    vm.MostrarRequisitos1 = false;

    vm.siguiente1 = function () {
        vm.MostrarInicio = false;
        vm.MostrarRequisitos = true;
        vm.MostrarRequisitos1 = false;
    };

    vm.siguiente = function () {
        vm.MostrarRequisitos = false;
        vm.MostrarRequisitos1 = true;
    };

    vm.imprimirRequisitos = function () {
        var left = (screen.width / 2) - 300;
        var top = (screen.height / 2) - 325;
        window.open("app/modules/home/requisitos.html", "_blank", "width=600,height=650,resizable=1,top=" + top + ",left=" + left);
    };

    vm.aclaraciones = function () {
        $location.path('/aclaraciones');
    };

    vm.vendedores = function () {
        $location.path('/vendedores');
    };
    vm.compradores = function () {
        $location.path('/compradores');
    };
    vm.recuperar = function () {
        $location.path('/recuperar');
    };
    vm.SeleccionarPartes = function () {
        vm.Tramite = new Tramite08();
        vm.Tramite.AmbasPartes = true;
        vm.Tramite.origenSite = appConfig.origenSite;

        if (session.len() <= 0) {
            session.add(vm.Tramite);
        }
        else {
            if (session.get(0).esMandatario) {
                vm.Tramite = session.get(0);
                vm.Tramite.AmbasPartes = true;
            }
            session.set(0, vm.Tramite);
        }

        $location.path("/vendedores");
    };
    vm.SeleccionarPartesConPrenda = function () {
        vm.Tramite = new Tramite08();
        vm.Tramite.AmbasPartes = true;
        vm.Tramite.ConPenda = true;
        vm.Tramite.origenSite = appConfig.origenSite;

        if (session.len() <= 0) {
            session.add(vm.Tramite);
        }
        else {
            if (session.get(0).esMandatario) {
                vm.Tramite = session.get(0);
                vm.Tramite.AmbasPartes = true;
            }
            session.set(0, vm.Tramite);
        }

        $location.path("/vendedores");
    };

    vm.diretoAmbasPartes = typeof ($rootScope.claims) !== "undefined" && $rootScope.claims !== "";
    if (vm.diretoAmbasPartes) {
        vm.SeleccionarPartes();
    }
};