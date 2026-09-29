angular
    .module('webApp')
    .controller('compradorpjController', ['$scope', '$http', '$routeParams', '$location', '$uibModal', '$rootScope', 'session', 'Comprador', compradorpjController]);

function compradorpjController($scope, $http, $routeParams, $location, $uibModal, $rootScope, session, Comprador) {
    var vm = this;

    var tramite = session.get(0);
    if (typeof (tramite) === "undefined") {
        $location.path('/');
        return;
    }

    vm.editar = false;
    vm.verificarEmail = typeof ($rootScope.claims) === "undefined" || $rootScope.claims === "";

    var comprador = session.get(1);
    if (typeof (comprador) !== "undefined") {
        if (typeof (comprador.solicitante) !== "undefined") {
            comprador = undefined;
        }
    }

    if (typeof (comprador) === "undefined") {
        vm.comprador = new PersonaFisica();
        vm.comprador.Tipo = 'J';
        vm.comprador.PorcentajeBien = 100;
    }
    else {
        vm.editar = true;
        vm.comprador = comprador;
        session.remove(1);
    }

    vm.subtitulo1 = $rootScope.subtitulo1;
    vm.mostrar = $rootScope.mostrar;

    vm.dateOptions = {
        formatYear: 'yyyy',
        maxDate: new Date(2020, 12, 31),
        minDate: new Date(1900, 1, 1),
        startingDay: 1
    };
    vm.open2 = function () {
        vm.popup2.opened = true;
    };
    vm.popup2 = {
        opened: false
    };

    vm.EliminarRepresentante = function (index) {
        vm.comprador.Apoderados.splice(index, 1);
    }

    vm.Representante = function (representante) {
        switch (representante) {
            case "1": return "Legal";
            case "2": return "Apoderado";
            case "S": return "Socio";
            default: return "Socio";
        }
    }

    vm.RepresentaA = function (representaA) {
        switch (representaA) {
            case "B": return "Comprador";
            case "C": return "Conyuge";
            case "S": return "Sociedad de Hecho";
            default:
                return "";
        }
    }

    vm.AsignaProvinciaLegal = function () {
        if (vm.comprador.ProvinciaLegal == "C")
            vm.comprador.PartidoLegal = "CABA";
        else
            vm.comprador.PartidoLegal = "";
    }

    vm.cancelar = function () {
        if (vm.editar) {
            tramite.Compradores.push(vm.comprador);
            session.set(0, tramite);
        }
        $location.path('/compradores/index');
    }

    vm.guardar = function () {
        vm.formErrors = [];

        if (vm.comprador.Apoderados.length <= 0) {
            vm.formErrors.push('Debe Cargar al menos un Representante para la certificación de firmas');
            return;
        }

        var domLegal = new Domicilio();
        domLegal.Tipo = 'L';
        domLegal.Calle = vm.comprador.CalleLegal;
        domLegal.Nro = vm.comprador.NroLegal;
        domLegal.Piso = vm.comprador.PisoLegal;
        domLegal.Dpto = vm.comprador.DptoLegal;
        domLegal.Partido = vm.comprador.PartidoLegal;
        domLegal.Localidad = vm.comprador.LocalidadLegal;
        domLegal.Provincia = vm.comprador.ProvinciaLegal;
        domLegal.CodigoPostal = vm.comprador.CPLegal;

        vm.comprador.Domicilios = [];
        vm.comprador.Domicilios.push(domLegal);

        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {

            var tramite = session.get(0);

            vm.comprador.FullName = vm.comprador.RazonSocial;

            tramite.Compradores = tramite.Compradores || [];
            if (tramite.Compradores.length <= 0) {
                recaptchaCallback = function (token) {
                    if (!tramite.esMandatario && vm.verificarEmail) {
                        Comprador.enviarCodigoEmail({ RecaptchaResponse: token, Email: vm.comprador.Contacto.Email },
                            function (data) {
                                grecaptcha.reset();
                                tramite.codigoEmail = data.codigo;
                                $uibModal.open({
                                    animation: true,
                                    templateUrl: 'app/modules/mandatario/modalEmailEnviado.html',
                                    controller: ['$scope', '$uibModalInstance', function ($modalscope, $uibModalInstance) {
                                        var vmModal = this;
                                        vmModal.solicitud = tramite;
                                        vmModal.submit = function () {
                                            grecaptcha.reset();
                                            vmModal.formErrors = [];
                                            vmModal.form.codigo.$setValidity('codigoInvalido', vmModal.solicitud.codigoEmail && vmModal.codigo && vmModal.solicitud.codigoEmail.toLowerCase() === vmModal.codigo.toLowerCase());
                                            $modalscope.$broadcast('show-errors-check-validity', 'form');
                                            if (vmModal.form.$valid) {
                                                $uibModalInstance.dismiss('cancel');

                                                vm.comprador.Contacto.Validado = 1;
                                                tramite.Compradores.push(vm.comprador);
                                                session.set(0, tramite);
                                                $location.path('/compradores/index');
                                            }
                                        };
                                        vmModal.cerrar = function () {
                                            $uibModalInstance.dismiss('cancel');
                                        };
                                    }],
                                    controllerAs: 'modalEmailEnviadoCtrl',
                                    backdrop: 'static'
                                });
                            },
                            function () {
                                grecaptcha.reset();
                            });
                    }
                    else {
                        vm.comprador.Contacto.Validado = 1;
                        tramite.Compradores.push(vm.comprador);
                        session.set(0, tramite);
                        $location.path('/compradores/index');
                    }
                };
                ////RE CAPTCHA CALLBACK
                grecaptcha.execute();
            }
            else {
                tramite.Compradores.push(vm.comprador);
                session.set(0, tramite);
                $location.path('/compradores/index');
            }
        }
    };

    vm.agregarRepresentante = function () {
        modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'app/modules/compradores/compradorshsocio.html',
            controller: ['$scope', '$uibModalInstance', 'comprador', function ($scope, $uibModalInstance, comprador) {

                $scope.comprador = comprador;

                $scope.roles = [
                    { text: 'Legal', value: '1' },
                    { text: 'Apoderado', value: '2' },
                    { text: 'Socio', value: 'S' }
                ];
                $scope.shouldShow = function (rol) {
                    return ($scope.comprador.Tipo === 'E') || rol.value !== 'S';
                }
                $scope.representados = [
                    { text: 'Comprador', value: 'B' },
                    { text: 'Conyuge', value: 'C' },
                    { text: 'Sociedad de Hecho', value: 'S' }
                ];
                $scope.shouldShowRepresentado = function (representado) {
                    return ($scope.comprador.Tipo === 'E') || representado.value !== 'S';
                }

                $scope.Representado = "B";

                $scope.aceptar = function () {

                    if (!$scope.legalCtrl.form.$valid) {
                        return;
                    }

                    var apoderado = new ApoderadoVendedor();

                    apoderado.Rol = $scope.Rol;
                    apoderado.CuitCuil = $scope.CuitCuil;
                    apoderado.Apellido = $scope.Apellido;
                    apoderado.Nombre = $scope.Nombre;
                    apoderado.Representado = "B";

                    $scope.comprador.Apoderados.push(apoderado);

                    $uibModalInstance.close($scope.comprador);
                }

                $scope.close = function () {
                    $scope.subtitulo1 = vm.subtitulo1;
                    $scope.mostrar = vm.mostrar;

                    $uibModalInstance.dismiss('cancel');
                }
            }],
            controllerAs: 'legalCtrl',
            backdrop: 'static',
            resolve: {
                comprador: function () {
                    return vm.comprador;
                }
            }
        });

        modalInstance.result.then(function (comprador) {
            vm.comprador = comprador;
        }, function () {
            //$log.info('Modal dismissed at: ' + new Date());
        });
    }

    $scope.$on('validationInterceptor-detected', function (event, modelState) {
        vm.formErrors = modelState[""];
    });
};