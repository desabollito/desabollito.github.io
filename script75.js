angular
    .module('webApp')
    .controller('titularesController', ['$rootScope', '$scope', '$compile', '$location', '$route', '$uibModal', '$http', '$window', 'popupService', 'session', 'home', 'provincia', 'localidad', 'Vendedor',
        titularesController]);

function titularesController($rootScope, $scope, $compile, $location, $route, $uibModal, $http, $window, popupService, session, home, provincia, localidad, Vendedor) {
    var vm = this;

    var tramite = session.get(0);
    if (typeof (tramite) === "undefined") {
        $location.path('/');
        return;
    }

    vm.Tramite = tramite;
    vm.vendedores = tramite.Vendedores || [];
    vm.gravamenes = tramite.Gravamenes || [];

    vm.TipoDocumento = function (tipoDoc) {
        switch (tipoDoc) {
            case "1": return "DNI";
            case "2": return "Libreta Enrolamiento";
            case "3": return "Libreta Cívica";
            case "4": return "DNI Extranjero";
            case "5": return "Cédula Extranjero";
            case "6": return "Pasaporte";
            case "C": return "CUIT";
            default:
                return "";
        }
    }

    vm.finalizar = function () {
        vm.formErrors = [];

        if (vm.vendedores.length <= 0) {
            vm.formErrors.push('Debe ingresar a los vendedores para comenzar el trámite de Transferencia');
            return;
        }

        modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'app/modules/vendedores/pregunta.html',
            controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {

                $scope.Titulo = "Prendas/Embargos";
                //$scope.Pregunta = "¿El Vehiculo que se esta transfiriendo​ tiene Prenda / Embargo?";
                $scope.Pregunta = "¿El vehículo que se va a transferir, tiene prendas o embargos preexistentes a la transferencia?";

                $scope.aceptar = function () {
                    $uibModalInstance.close(true);
                }

                $scope.close = function () {
                    tramite.Gravamenes = [];
                    $uibModalInstance.close(false);
                }
            }],
            controllerAs: 'legalCtrl',
            backdrop: 'static',
            resolve: {
            }
        });

        modalInstance.result.then(function (rta) {
            if (rta)
                $location.path("/vendedores/gravamenes");
            else
                $location.path("/vendedores/confirmar");
        }, function () {
        });
    }

    vm.confirmar = function () {
        vm.formErrors = [];

        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            vm.esSiteRegistro = typeof ($rootScope.claims) !== "undefined" && $rootScope.claims !== "";
            if (vm.esSiteRegistro) {
                Vendedor.saveList(tramite,
                    function (data) {
                        vm.Tramite.NumeroPrecarga = data.NP;
                        session.set(0, vm.Tramite);

                        if (!vm.Tramite.AmbasPartes) {
                            $location.path("/vendedores/final");
                        }
                        else {
                            $location.path('/compradores/index');
                        }
                    },
                    function (error) {
                        vm.formErrors = [];
                        if (error.data.ModelState) {
                            if (error.data.ModelState.captchaText) {
                                vm.formErrors.push(error.data.ModelState.captchaText[0]);
                            }
                        }
                        else {
                            vm.formErrors.push(error.data.ExceptionMessage);
                        }
                    });
            }
            else {
                recaptchaCallback = function (token) {
                    tramite.ReCaptchaResponse = token;

                    Vendedor.saveList(tramite,
                        function (data) {
                            grecaptcha.reset();

                            vm.Tramite.NumeroPrecarga = data.NP;
                            session.set(0, vm.Tramite);

                            if (!vm.Tramite.AmbasPartes) {
                                $location.path("/vendedores/final");
                            }
                            else {
                                $location.path('/compradores/index');
                            }
                        },
                        function (error) {
                            vm.formErrors = [];
                            if (error.data.ModelState) {
                                if (error.data.ModelState.captchaText) {
                                    vm.formErrors.push(error.data.ModelState.captchaText[0]);
                                }
                            }
                            else {
                                vm.formErrors.push(error.data.ExceptionMessage);
                            }

                            grecaptcha.reset();
                        });
                };
                grecaptcha.execute();
            }
        }
    }

    vm.EliminarVendedor = function (index) {
        vm.vendedores.splice(index, 1);
    }

    vm.EditarVendedor = function (index) {
        var vendedor = vm.vendedores[index];
        vm.vendedores.splice(index, 1);

        session.remove(1);
        session.add(vendedor)

        switch (vendedor.Tipo) {
            case "F": $location.path('/vendedores/newph'); break;
            case "J": $location.path('/vendedores/newpj'); break;
            case "E": $location.path('/vendedores/newsh'); break;
            default:

        }
    }

    vm.EliminarGravamen = function (index) {
        vm.gravamenes.splice(index, 1);
    }

    $scope.$on('validationInterceptor-detected', function (event, modelState) {
        vm.formErrors = modelState[""];
    });

}