angular
    .module('webApp')
    .controller('compradorphController', ['$rootScope', '$scope', '$http', '$routeParams', '$location', '$uibModal', 'Comprador', 'session', compradorphController]);

function compradorphController($rootScope, $scope, $http, $routeParams, $location, $uibModal, Comprador, session) {
    var vm = this;
    console.log(session.get(0));
    console.log(session.get(1));


    var tramite = session.get(0);
    
    //tramite = session.get(0);
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
        if (tramite.esEscribano && tramite.Compradores.length === 0) {
            comprador = undefined;
        }

    }

    if (typeof (comprador) === "undefined") {
        vm.comprador = new PersonaFisica();
        vm.comprador.Tipo = 'F';
        vm.comprador.EstadoCivil = '1';
        vm.comprador.PorcentajeBien = 100;
        vm.comprador.Nacionalidad = '200';
    }
    else {
        vm.editar = true;
        vm.comprador = comprador;
        session.remove(1);
    }

    vm.subtitulo1 = $rootScope.subtitulo1;
    vm.mostrar = $rootScope.mostrar;

    $scope.$watch('compradorCtrl.comprador.EstadoCivil', function (newVal, oldVal) {

        if (newVal !== '2') {
            vm.comprador.Conyuge.TipoDocumento = '1';
            vm.comprador.Conyuge.NroDocumento = '';
            vm.comprador.Conyuge.Nombre = '';
            vm.comprador.Conyuge.Apellido = '';
            vm.comprador.Conyuge.CaracterBien = 'P';
        }

    });

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

    vm.mostrarApoderado = vm.comprador.Apoderados.length;

    vm.EliminarRepresentante = function (index) {
        vm.comprador.Apoderados.splice(index, 1);
    }

    vm.duplicarDomicilio = function () {
        vm.comprador.CalleReal = vm.comprador.CalleLegal;
        vm.comprador.NroReal = vm.comprador.NroLegal;
        vm.comprador.PisoReal = vm.comprador.PisoLegal;
        vm.comprador.DptoReal = vm.comprador.DptoLegal;
        vm.comprador.LocalidadReal = vm.comprador.LocalidadLegal;
        vm.comprador.ProvinciaReal = vm.comprador.ProvinciaLegal;
        vm.comprador.PartidoReal = vm.comprador.PartidoLegal;
        vm.comprador.CPReal = vm.comprador.CPLegal;
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
            default: return "";
        }
    }

    vm.AsignaProvinciaLegal = function () {
        if (vm.comprador.ProvinciaLegal == "C")
            vm.comprador.PartidoLegal = "CABA";
        else
            vm.comprador.PartidoLegal = "";
    }

    vm.AsignaProvinciaReal = function () {
        if (vm.comprador.ProvinciaReal == "C")
            vm.comprador.PartidoReal = "CABA";
        else
            vm.comprador.PartidoReal = "";
    }

    vm.dateOptions = {
        formatYear: 'yyyy',
        startingDay: 1
    };
    vm.open2 = function () {
        vm.popup2.opened = true;
    };
    vm.popup2 = {
        opened: false
    };

    vm.cancelar = function () {
        if (vm.editar) {
            tramite.Compradores.push(vm.comprador);
            session.set(0, tramite);
        }
        $location.path('/compradores/index');
    }

    vm.guardar = function () {
        var tramite = session.get(0);
        tramite.Compradores = tramite.Compradores || [];

        vm.formErrors = [];

        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {

            //var tramite = session.get(0);

            if (vm.comprador.EstadoCivil !== '2') {
                vm.comprador.CaracterBien = 'P';
            }

            vm.comprador.FullName = vm.comprador.Apellido + ', ' + vm.comprador.Nombre;

            vm.comprador.Domicilios = [];

            var domReal = new Domicilio();
            domReal.Tipo = 'R';
            domReal.Calle = vm.comprador.CalleReal;
            domReal.Nro = vm.comprador.NroReal;
            domReal.Piso = vm.comprador.PisoReal;
            domReal.Dpto = vm.comprador.DptoReal;
            domReal.Partido = vm.comprador.PartidoReal;
            domReal.Localidad = vm.comprador.LocalidadReal;
            domReal.Provincia = vm.comprador.ProvinciaReal;
            domReal.CodigoPostal = vm.comprador.CPReal;
            vm.comprador.Domicilios.push(domReal);

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
            vm.comprador.Domicilios.push(domLegal);

            tramite.Compradores = tramite.Compradores || [];
            if (tramite.Compradores.length <= 0) {
                if (!(tramite.esMandatario || tramite.esEscribano) && vm.verificarEmail) {
                    recaptchaCallback = function (token) {
                        Comprador.enviarCodigoEmail({ RecaptchaResponse: token, Email: vm.comprador.Contacto.Email },
                            function (data) {
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
                    };
                    //RE CAPTCHA CALLBACK
                    grecaptcha.execute();
                }
                else {
                    vm.comprador.Contacto.Validado = 1;
                    tramite.Compradores.push(vm.comprador);
                    session.set(0, tramite);
                    $location.path('/compradores/index');
                }

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
                    $scope.$broadcast('show-errors-check-validity', 'form');
                    if ($scope.legalCtrl.form.$valid) {
                        var apoderado = new ApoderadoVendedor();

                        apoderado.Rol = $scope.Rol;
                        apoderado.CuitCuil = $scope.CuitCuil;
                        apoderado.Apellido = $scope.Apellido;
                        apoderado.Nombre = $scope.Nombre;
                        if ($scope.comprador.EstadoCivil === '2') {
                            apoderado.Representado = $scope.Representado;
                        }
                        else {
                            apoderado.Representado = "B";
                        }

                        $scope.comprador.Apoderados.push(apoderado);

                        $uibModalInstance.close($scope.comprador);
                    }
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


    //$scope.$on('validationInterceptor-detected', function (event, modelState) {
    //    vm.formErrors = modelState[""];
    //});
};